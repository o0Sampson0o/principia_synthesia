"use server";

import { db } from "@/db";
import {
  books,
  articles,
  curriculumEntries,
  bookSnapshots,
  bookSnapshotEntries,
  resourceVisibility,
} from "@/db/schema";
import { eq, asc, and, isNull, inArray, like } from "drizzle-orm";
import { setContentTags } from "@/lib/content-tags";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseFrontmatter } from "@/lib/frontmatter";
import { canView } from "@/lib/access";
import { assertEditRights } from "@/app/[publisher]/articles/actions";
import {
  createBookSchema,
  deleteBookSchema,
  updateBookSchema,
  saveBookOutlineSchema,
  addExternalArticleSchema,
  promoteArticleSchema,
  absorbArticleSchema,
} from "@/lib/validations";
import { resolvePublisher } from "@/lib/publisher";
import { isUniqueViolation } from "@/lib/db-errors";
import { withDividerTitles } from "@/lib/curriculum";
import { planOutlineSave } from "@/lib/book-outline";
import { normalizePrefixedSlug, prefixedSlug, uniqueSlug } from "@/lib/slugify";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Book CRUD
// ---------------------------------------------------------------------------

export async function createBook(
  publisherSlug: string,
  formData: FormData
): Promise<{ error: string } | void> {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  // The slug field is optional and its `book-` prefix implied: a typed slug
  // is normalized; a blank one is derived from the title and, unlike a typed
  // one, quietly suffixed (-2, -3…) past this publisher's existing books.
  const title = String(formData.get("title") ?? "");
  let slug = normalizePrefixedSlug("book-", String(formData.get("slug") ?? ""));
  if (!slug) {
    const base = prefixedSlug("book-", title, "untitled");
    const existing = await db
      .select({ slug: books.slug })
      .from(books)
      .where(and(eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), like(books.slug, `${base}%`)));
    slug = uniqueSlug(base, new Set(existing.map((b) => b.slug)));
  }

  const validated = createBookSchema.parse({
    slug,
    title,
    summary: formData.get("summary"),
    ownerType,
    ownerId,
  });

  let book: { id: number };
  try {
    [book] = await db.insert(books).values({
      slug: validated.slug,
      title: validated.title,
      summary: validated.summary,
      ownerType: validated.ownerType,
      ownerId: validated.ownerId,
    }).returning({ id: books.id });
  } catch (err) {
    // Duplicate slug (including one held by a binned book) is a user
    // mistake, not a crash — returned so the form keeps its state.
    if (isUniqueViolation(err)) {
      return { error: "A book with this slug already exists (it may be in the bin). Pick a different slug." };
    }
    throw err;
  }

  const categorySlugs = (formData.get("categories") as string)?.split(",").filter(Boolean) ?? [];
  await setContentTags("book", book.id, categorySlugs, session.userId);

  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}/books/${validated.slug}`);
}

export async function deleteBook(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = deleteBookSchema.parse({ bookId: formData.get("bookId") });

  // Soft delete: stamping deletedAt hides the book (and with it every chapter,
  // snapshot and curriculum entry, which are only reachable through it) while
  // keeping all rows intact for restore from the bin. The real DELETE — whose
  // FK cascades take curriculumEntries, bookSnapshots, pdfCaches and internal
  // articles with it — happens in the prune cron after 30 days, or via
  // "Delete forever" in the bin.
  await db
    .update(books)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId))
    );

  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}`);
}

export async function updateBook(publisherSlug: string, formData: FormData) {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = updateBookSchema.parse({
    id: formData.get("id"),
    slug: normalizePrefixedSlug("book-", String(formData.get("slug") ?? "")) ?? "",
    title: formData.get("title"),
    summary: formData.get("summary"),
    categories: formData.get("categories"),
    macros: formData.get("macros") ?? undefined,
  });

  const categorySlugs = validated.categories?.split(",").filter(Boolean) ?? [];

  const [current] = await db
    .select({ slug: books.slug, metadata: books.metadata })
    .from(books)
    .where(eq(books.id, validated.id))
    .limit(1);

  // `metadata` is a whole JSONB document; merge so editing the book form never
  // drops status/tags/description that this form does not show.
  const macros = validated.macros?.trim() ?? "";
  const metadata = current
    ? { ...current.metadata, ...(macros ? { macros } : { macros: undefined }) }
    : undefined;

  try {
    await db
      .update(books)
      .set({
        slug: validated.slug,
        title: validated.title,
        summary: validated.summary,
        ...(metadata ? { metadata } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(books.id, validated.id), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Another book already uses that slug. Choose a different one." };
    }
    throw err;
  }

  await setContentTags("book", validated.id, categorySlugs, session.userId);

  if (current) revalidatePath(`/${publisherSlug}/books/${current.slug}`);
  revalidatePath(`/${publisherSlug}/books/${validated.slug}`);
  revalidatePath(`/${publisherSlug}/books/${validated.slug}/edit`);
  redirect(`/${publisherSlug}/books/${validated.slug}`);
}

// ---------------------------------------------------------------------------
// Curriculum entries
// ---------------------------------------------------------------------------


/**
 * The book outline editor's single save: the whole curriculum in final order —
 * kept rows, renamed or re-levelled Part/Chapter dividers, new dividers, new
 * internal sections (slug derived from the title, de-duplicated within the
 * book), the publisher's standalone articles added as sections, and removals —
 * written in one transaction.
 *
 * `payload` is JSON validated by `saveBookOutlineSchema`; the cross-row rules
 * and the write plan come from `planOutlineSave` (lib/book-outline.ts).
 * Removing an internal section deletes its article, exactly like the old
 * per-row Remove did; the editor confirms that before submitting.
 */
export async function saveBookOutline(
  publisherSlug: string,
  formData: FormData
): Promise<{ error: string } | void> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "The outline could not be read. Reload and try again." };
  }
  const parsed = saveBookOutlineSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "The outline is not valid." };
  }
  const { bookId, baseIds, items } = parsed.data;

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const savedRows = await db
    .select({
      entryId: curriculumEntries.id,
      articleId: curriculumEntries.articleId,
      partTitle: curriculumEntries.partTitle,
      dividerLevel: curriculumEntries.dividerLevel,
      slug: articles.slug,
      isInternal: articles.isInternal,
    })
    .from(curriculumEntries)
    .leftJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookId, bookId))
    .orderBy(asc(curriculumEntries.position), asc(curriculumEntries.id));

  // Slugs a new section must avoid: every internal article ever made in this
  // book (the unique index covers binned rows too) and every article in it.
  const internalSlugs = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(eq(articles.parentBookId, bookId));
  const takenSlugs = new Set<string>([
    ...internalSlugs.map((r) => r.slug),
    ...savedRows.flatMap((r) => (r.slug ? [r.slug] : [])),
  ]);

  const plan = planOutlineSave({
    saved: savedRows.map((r) => ({
      entryId: r.entryId,
      articleId: r.articleId,
      kind: r.articleId !== null ? "section" : r.dividerLevel === "chapter" ? "chapter" : "part",
      title: r.articleId !== null ? null : r.partTitle,
      isInternal: r.isInternal ?? false,
    })),
    baseIds,
    items,
    takenSlugs,
  });
  if ("error" in plan) return plan;

  // Added articles: same-publisher standalone only (another publisher's
  // article goes through addExternalArticle and its visibility check), and
  // never one whose slug a section of this book already uses.
  const addIds = plan.rows.flatMap((r) => (r.op === "add-article" ? [r.articleId] : []));
  if (addIds.length > 0) {
    const found = await db
      .select({ id: articles.id, slug: articles.slug })
      .from(articles)
      .where(
        and(
          inArray(articles.id, addIds),
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId),
          eq(articles.isInternal, false),
          isNull(articles.deletedAt)
        )
      );
    if (found.length !== addIds.length) {
      return { error: "One of the added articles is not one of your standalone articles." };
    }
    const removedIds = new Set(plan.removals.map((r) => r.entryId));
    const keptSlugs = new Set(
      savedRows.filter((r) => r.slug && !removedIds.has(r.entryId)).map((r) => r.slug)
    );
    for (const row of plan.rows) {
      if (row.op === "new-section") keptSlugs.add(row.slug);
    }
    const clash = found.find((a) => keptSlugs.has(a.slug));
    if (clash) {
      return { error: `A section of this book already uses the slug "${clash.slug}".` };
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const r of plan.removals) {
        // An internal article lives only in this book: delete it (its entry
        // cascades). Anything else just leaves the book.
        if (r.deleteArticleId !== null) {
          await tx.delete(articles).where(and(eq(articles.id, r.deleteArticleId), eq(articles.parentBookId, bookId)));
        }
        await tx.delete(curriculumEntries).where(and(eq(curriculumEntries.id, r.entryId), eq(curriculumEntries.bookId, bookId)));
      }

      for (const r of plan.renames) {
        await tx
          .update(curriculumEntries)
          .set({ partTitle: r.title, dividerLevel: r.kind })
          .where(and(eq(curriculumEntries.id, r.entryId), eq(curriculumEntries.bookId, bookId), isNull(curriculumEntries.articleId)));
      }

      for (const [position, row] of plan.rows.entries()) {
        if (row.op === "keep") {
          await tx
            .update(curriculumEntries)
            .set({ position })
            .where(and(eq(curriculumEntries.id, row.entryId), eq(curriculumEntries.bookId, bookId)));
        } else if (row.op === "new-divider") {
          await tx.insert(curriculumEntries).values({
            bookId,
            articleId: null,
            position,
            partTitle: row.title,
            dividerLevel: row.kind,
          });
        } else if (row.op === "add-article") {
          await tx.insert(curriculumEntries).values({ bookId, articleId: row.articleId, position });
        } else {
          const content = internalArticleContent(row.title);
          const [article] = await tx
            .insert(articles)
            .values({
              slug: row.slug,
              title: row.title,
              content,
              ownerType,
              ownerId,
              isInternal: true,
              parentBookId: bookId,
              metadata: parseFrontmatter(content).metadata,
            })
            .returning({ id: articles.id });
          await tx.insert(curriculumEntries).values({ bookId, articleId: article.id, position });
        }
      }
    });
  } catch (err) {
    // A concurrent save took a slug or article between planning and writing.
    if (isUniqueViolation(err)) {
      return { error: "The book changed while saving. Reload and try again." };
    }
    throw err;
  }

  revalidatePath(`/${publisherSlug}/books/${book.slug}`, "layout");
  revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
}

/** Starting MDX for a new internal section: default frontmatter + its title. */
function internalArticleContent(title: string): string {
  return `---\nstatus: published\ntags: []\ndescription: ""\ncanvas: null\n---\n\n# ${title}\n`;
}

export async function addExternalArticle(
  publisherSlug: string,
  formData: FormData
) {
  // 1. Caller must own the book.
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  // 2. Validate input shape.
  const validated = addExternalArticleSchema.parse({
    bookId: formData.get("bookId"),
    targetPublisher: formData.get("targetPublisher"),
    articleSlug: normalizePrefixedSlug("article-", String(formData.get("articleSlug") ?? "")) ?? "",
    position: formData.get("position"),
  });

  // 3a. Verify the book belongs to this publisher.
  const [ownedBook] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!ownedBook) throw new Error("Book not found");

  // 3. Disallow targeting the same publisher (must use upsertCurriculumEntry).
  if (validated.targetPublisher === publisherSlug) {
    throw new Error(
      "Use the same-publisher section picker for your own articles."
    );
  }

  // 4. Resolve target publisher → ownerType / ownerId.
  const targetPub = await resolvePublisher(validated.targetPublisher);
  if (!targetPub) throw new Error("Target publisher not found");
  const articleOwnerType: "user" | "org" =
    targetPub.kind === "user" ? "user" : "org";
  const articleOwnerId =
    (targetPub.kind === "user" ? targetPub.userId : targetPub.orgId)!;

  // 5. Find the article (non-internal, non-deleted only).
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, articleOwnerType),
        eq(articles.ownerId, articleOwnerId),
        eq(articles.slug, validated.articleSlug),
        eq(articles.isInternal, false),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);
  if (!article) throw new Error("Article not found");

  // 6. Visibility gate: the caller's session must currently be able to see
  //    the source article. canView() handles public / org / private + grants.
  const canSee = await canView(
    {
      type: "article",
      ownerType: articleOwnerType,
      ownerId: articleOwnerId,
      slug: validated.articleSlug,
    },
    session
  );
  if (!canSee) throw new Error("You do not have access to that article");

  // 7. Slug conflict: no other article in the same book may share this slug.
  const [conflict] = await db
    .select({ id: curriculumEntries.id })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(
      and(
        eq(curriculumEntries.bookId, validated.bookId),
        eq(articles.slug, validated.articleSlug)
      )
    )
    .limit(1);
  if (conflict) {
    return { error: "A section with that slug already exists in this book." };
  }

  // 8. Insert curriculum entry.
  await db.insert(curriculumEntries).values({
    bookId: validated.bookId,
    articleId: article.id,
    position: validated.position,
  });

  // 9. Revalidate book pages.
  revalidatePath(`/${publisherSlug}/books/${ownedBook.slug}`);
  revalidatePath(`/${publisherSlug}/books/${ownedBook.slug}/edit`);
}

/**
 * Internal → Standalone. Flips an internal (book-only) article into a
 * standalone article. The curriculum entry is kept, so it stays a chapter of
 * the book; it simply also becomes independently addressable at
 * /:publisher/articles/:slug and shows up in listings, search and the sitemap.
 *
 * No slug work is needed: internal and standalone articles already share one
 * per-publisher slug namespace (unique(ownerType, ownerId, slug)), so the row
 * keeps its already-unique slug.
 */
export async function promoteArticleToStandalone(
  publisherSlug: string,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const { articleId } = promoteArticleSchema.parse({
    articleId: formData.get("articleId"),
  });

  // The article must be internal and owned by this publisher.
  const [article] = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      isInternal: articles.isInternal,
      parentBookId: articles.parentBookId,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, articleId),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId)
      )
    )
    .limit(1);
  if (!article) throw new Error("Article not found");
  if (!article.isInternal) throw new Error("Article is already standalone");

  // Resolve the parent book (for visibility carry-over + revalidation).
  const parentBookId = article.parentBookId;
  const [book] = parentBookId
    ? await db
        .select({ id: books.id, slug: books.slug })
        .from(books)
        .where(eq(books.id, parentBookId))
        .limit(1)
    : [];

  // Book-internal slugs are only unique within their book, but standalone slugs
  // are unique publisher-wide — so promoting can collide with an existing
  // standalone article in a way that was impossible when everything shared one
  // namespace. Check first: the partial unique index would otherwise reject the
  // UPDATE with a raw constraint error.
  const [clash] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.slug, article.slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.parentBookId),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);
  if (clash) {
    throw new Error(
      `A standalone article with the slug "${article.slug}" already exists. Rename this section before making it standalone.`
    );
  }

  // Flip the flags. The article now stands on its own (no longer
  // cascade-deletes with the book).
  await db
    .update(articles)
    .set({ isInternal: false, parentBookId: null, updatedAt: new Date() })
    .where(eq(articles.id, articleId));

  // Carry the book's visibility onto the now-public article so we don't
  // accidentally expose a chapter of a private/org-only book. Default
  // (absent row) is public, so we only need to act when the book is restricted.
  if (book) {
    const [bookVis] = await db
      .select({ visibility: resourceVisibility.visibility })
      .from(resourceVisibility)
      .where(
        and(
          eq(resourceVisibility.resourceType, "book"),
          eq(resourceVisibility.ownerType, ownerType),
          eq(resourceVisibility.ownerId, ownerId),
          eq(resourceVisibility.resourceKey, book.slug)
        )
      )
      .limit(1);

    if (bookVis && bookVis.visibility !== "public") {
      await db
        .insert(resourceVisibility)
        .values({
          resourceType: "article",
          ownerType,
          ownerId,
          resourceKey: article.slug,
          visibility: bookVis.visibility,
        })
        .onConflictDoUpdate({
          target: [
            resourceVisibility.resourceType,
            resourceVisibility.ownerType,
            resourceVisibility.ownerId,
            resourceVisibility.resourceKey,
          ],
          set: { visibility: bookVis.visibility, updatedAt: new Date() },
        });
    }
  }

  if (book) {
    revalidatePath(`/${publisherSlug}/books/${book.slug}`);
    revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
    revalidatePath(`/${publisherSlug}/books/${book.slug}/${article.slug}`);
  }
  revalidatePath(`/${publisherSlug}/articles`);
  revalidatePath(`/${publisherSlug}/articles/${article.slug}`);
  revalidatePath(`/${publisherSlug}`);
}

/**
 * Standalone → Internal. Absorbs a standalone article into a book, making it an
 * internal (book-only) article. Only permitted when the article is owned by the
 * same publisher as the book AND is a chapter in exactly one book (the target).
 * After this the article disappears from standalone listings/search/sitemap,
 * its /:publisher/articles/:slug URL 404s, and it cascade-deletes with the book.
 */
export async function absorbArticleIntoBook(
  publisherSlug: string,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const { articleId, bookId } = absorbArticleSchema.parse({
    articleId: formData.get("articleId"),
    bookId: formData.get("bookId"),
  });

  // The target book must belong to this publisher.
  const [book] = await db
    .select({ id: books.id, slug: books.slug })
    .from(books)
    .where(
      and(
        eq(books.id, bookId),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNull(books.deletedAt)
      )
    )
    .limit(1);
  if (!book) throw new Error("Book not found");

  // The article must be standalone and owned by this publisher (never absorb
  // another publisher's borrowed article — that would change ownership).
  const [article] = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      isInternal: articles.isInternal,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, articleId),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);
  if (!article) throw new Error("Article not found");
  if (article.isInternal) throw new Error("Article is already internal");

  // The article must be a chapter in exactly one book, and that book must be
  // the target. Otherwise absorbing it would orphan it from the other books.
  const entries = await db
    .select({ bookId: curriculumEntries.bookId })
    .from(curriculumEntries)
    .where(eq(curriculumEntries.articleId, articleId));
  if (entries.length !== 1 || entries[0].bookId !== bookId) {
    throw new Error(
      "This article is used in other books. Remove it from those books before making it internal to this one."
    );
  }

  await db
    .update(articles)
    .set({ isInternal: true, parentBookId: bookId, updatedAt: new Date() })
    .where(eq(articles.id, articleId));

  revalidatePath(`/${publisherSlug}/books/${book.slug}`);
  revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
  revalidatePath(`/${publisherSlug}/books/${book.slug}/${article.slug}`);
  revalidatePath(`/${publisherSlug}/articles`);
  revalidatePath(`/${publisherSlug}/articles/${article.slug}`);
  revalidatePath(`/${publisherSlug}`);
}

// ---------------------------------------------------------------------------
// Book snapshots
// ---------------------------------------------------------------------------

export async function snapshotBook(publisherSlug: string, bookId: number, note?: string) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const entries = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: articles.id,
      slug: articles.slug,
      title: articles.title,
      content: articles.content,
    })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(eq(curriculumEntries.bookId, bookId))
    .orderBy(asc(curriculumEntries.position))
    .then((rows) =>
      withDividerTitles(
        rows.map((r) => ({ ...r, chapterTitle: null as string | null })),
        bookId
      )
    );

  await db.transaction(async (tx) => {
    const [snapshot] = await tx
      .insert(bookSnapshots)
      .values({ bookId, note: note ?? null })
      .returning({ id: bookSnapshots.id });

    if (entries.length > 0) {
      await tx.insert(bookSnapshotEntries).values(
        entries.map((e) => ({
          snapshotId: snapshot.id,
          articleId: e.articleId,
          articleSlug: e.slug,
          articleTitle: e.title,
          articleContent: e.content,
          position: e.position,
          partTitle: e.partTitle,
          chapterTitle: e.chapterTitle,
        }))
      );
    }
  });

  revalidatePath(`/${publisherSlug}/books/${book.slug}/snapshots`);
}
