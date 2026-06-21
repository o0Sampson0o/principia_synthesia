"use server";

import { db } from "@/db";
import {
  books,
  articles,
  curriculumEntries,
  bookSnapshots,
  bookSnapshotEntries,
  publishers,
} from "@/db/schema";
import { eq, asc, and, isNull } from "drizzle-orm";
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
  upsertCurriculumEntrySchema,
  removeCurriculumEntrySchema,
  createInternalArticleSchema,
  addExternalArticleSchema,
} from "@/lib/validations";
import { resolvePublisher } from "@/lib/publisher";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Book CRUD
// ---------------------------------------------------------------------------

export async function createBook(publisherSlug: string, formData: FormData) {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = createBookSchema.parse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    summary: formData.get("summary"),
    ownerType,
    ownerId,
  });

  const [book] = await db.insert(books).values({
    slug: validated.slug,
    title: validated.title,
    summary: validated.summary,
    ownerType: validated.ownerType,
    ownerId: validated.ownerId,
  }).returning({ id: books.id });

  const categorySlugs = (formData.get("categories") as string)?.split(",").filter(Boolean) ?? [];
  await setContentTags("book", book.id, categorySlugs, session.userId);

  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}/books/${validated.slug}`);
}

export async function deleteBook(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = deleteBookSchema.parse({ bookId: formData.get("bookId") });

  // Cascade deletes: curriculumEntries, bookSnapshots, pdfCaches, internal articles
  await db.delete(books).where(
    and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId))
  );

  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}`);
}

export async function updateBook(publisherSlug: string, formData: FormData) {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = updateBookSchema.parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    title: formData.get("title"),
    summary: formData.get("summary"),
    categories: formData.get("categories"),
  });

  const categorySlugs = validated.categories?.split(",").filter(Boolean) ?? [];

  const [current] = await db
    .select({ slug: books.slug })
    .from(books)
    .where(eq(books.id, validated.id))
    .limit(1);

  await db
    .update(books)
    .set({
      slug: validated.slug,
      title: validated.title,
      summary: validated.summary,
      updatedAt: new Date()
    })
    .where(and(eq(books.id, validated.id), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)));

  await setContentTags("book", validated.id, categorySlugs, session.userId);

  if (current) revalidatePath(`/${publisherSlug}/books/${current.slug}`);
  revalidatePath(`/${publisherSlug}/books/${validated.slug}`);
  revalidatePath(`/${publisherSlug}/books/${validated.slug}/edit`);
  redirect(`/${publisherSlug}/books/${validated.slug}`);
}

// ---------------------------------------------------------------------------
// Curriculum entries
// ---------------------------------------------------------------------------

export async function upsertCurriculumEntry(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = upsertCurriculumEntrySchema.parse({
    bookId: formData.get("bookId"),
    articleId: formData.get("articleId"),
    position: formData.get("position"),
    partTitle: formData.get("partTitle") || null,
  });

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  // Security: this entry point is for same-publisher articles only.
  // Cross-publisher articles must go through addExternalArticle, which
  // performs a visibility check rather than an ownership check.
  const [art] = await db
    .select({ ownerType: articles.ownerType, ownerId: articles.ownerId })
    .from(articles)
    .where(and(eq(articles.id, validated.articleId), isNull(articles.deletedAt)))
    .limit(1);
  if (!art) throw new Error("Article not found");
  if (art.ownerType !== ownerType || art.ownerId !== ownerId) {
    throw new Error(
      "This article is not owned by the current publisher. Use addExternalArticle."
    );
  }

  const existing = await db
    .select({ id: curriculumEntries.id })
    .from(curriculumEntries)
    .where(
      and(
        eq(curriculumEntries.bookId, validated.bookId),
        eq(curriculumEntries.articleId, validated.articleId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(curriculumEntries)
      .set({ position: validated.position, partTitle: validated.partTitle })
      .where(eq(curriculumEntries.id, existing[0].id));
  } else {
    await db.insert(curriculumEntries).values(validated);
  }

  revalidatePath(`/${publisherSlug}/books/${book.slug}`);
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
    articleSlug: formData.get("articleSlug"),
    position: formData.get("position"),
    partTitle: formData.get("partTitle") || null,
  });

  // 3a. Verify the book belongs to this publisher.
  const [ownedBook] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!ownedBook) throw new Error("Book not found");

  // 3. Disallow targeting the same publisher (must use upsertCurriculumEntry).
  if (validated.targetPublisher === publisherSlug) {
    throw new Error(
      "Use the same-publisher chapter picker for your own articles."
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
    throw new Error(
      `A chapter with slug "${validated.articleSlug}" already exists in this book`
    );
  }

  // 8. Insert curriculum entry.
  await db.insert(curriculumEntries).values({
    bookId: validated.bookId,
    articleId: article.id,
    position: validated.position,
    partTitle: validated.partTitle,
  });

  // 9. Revalidate book pages.
  revalidatePath(`/${publisherSlug}/books/${ownedBook.slug}`);
  revalidatePath(`/${publisherSlug}/books/${ownedBook.slug}/edit`);
}

export async function removeCurriculumEntry(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = removeCurriculumEntrySchema.parse({
    id: formData.get("id"),
    bookId: formData.get("bookId"),
  });

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  // Check if article is internal — if so, delete the article itself
  const [entry] = await db
    .select({ articleId: curriculumEntries.articleId })
    .from(curriculumEntries)
    .where(eq(curriculumEntries.id, validated.id))
    .limit(1);

  if (entry) {
    const [article] = await db
      .select({ isInternal: articles.isInternal })
      .from(articles)
      .where(eq(articles.id, entry.articleId))
      .limit(1);

    if (article?.isInternal) {
      await db.delete(articles).where(eq(articles.id, entry.articleId));
    } else {
      await db.delete(curriculumEntries).where(eq(curriculumEntries.id, validated.id));
    }
  }

  revalidatePath(`/${publisherSlug}/books/${book.slug}`);
  revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
}

export async function reorderCurriculumEntries(
  publisherSlug: string,
  bookId: number,
  orderedIds: number[]
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(curriculumEntries)
        .set({ position: i })
        .where(eq(curriculumEntries.id, orderedIds[i]));
    }
  });

  revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
}

export async function reorderChapters(publisherSlug: string, formData: FormData) {
  await assertEditRights(publisherSlug);
  const bookId = Number(formData.get("bookId"));
  const raw = formData.get("orderedIds") as string;
  const orderedIds = JSON.parse(raw) as number[];
  await reorderCurriculumEntries(publisherSlug, bookId, orderedIds);
}

// ---------------------------------------------------------------------------
// Internal articles
// ---------------------------------------------------------------------------

export async function createInternalArticle(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = createInternalArticleSchema.parse({
    bookId: formData.get("bookId"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    position: formData.get("position"),
    partTitle: formData.get("partTitle") || null,
  });

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, validated.bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const defaultContent = `---\nstatus: published\ntags: []\ndescription: ""\ncanvas: null\n---\n\n# ${validated.title}\n`;
  const parsed = parseFrontmatter(defaultContent);

  await db.transaction(async (tx) => {
    const [article] = await tx
      .insert(articles)
      .values({
        slug: validated.slug,
        title: validated.title,
        content: defaultContent,
        ownerType,
        ownerId,
        isInternal: true,
        parentBookId: validated.bookId,
        metadata: parsed.metadata,
      })
      .returning({ id: articles.id });

    await tx.insert(curriculumEntries).values({
      bookId: validated.bookId,
      articleId: article.id,
      position: validated.position,
      partTitle: validated.partTitle,
    });
  });

  revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
  redirect(`/${publisherSlug}/books/${book.slug}/edit`);
}

// ---------------------------------------------------------------------------
// Book snapshots
// ---------------------------------------------------------------------------

export async function snapshotBook(publisherSlug: string, bookId: number, note?: string) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const [book] = await db.select({ id: books.id, slug: books.slug }).from(books)
    .where(and(eq(books.id, bookId), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const entries = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: curriculumEntries.articleId,
      slug: articles.slug,
      title: articles.title,
      content: articles.content,
    })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(eq(curriculumEntries.bookId, bookId))
    .orderBy(asc(curriculumEntries.position));

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
        }))
      );
    }
  });

  revalidatePath(`/${publisherSlug}/books/${book.slug}/snapshots`);
}
