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
import { eq, asc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { parseFrontmatter } from "@/lib/frontmatter";
import { canView } from "@/lib/access";
import {
  createBookSchema,
  deleteBookSchema,
  updateBookSchema,
  upsertCurriculumEntrySchema,
  removeCurriculumEntrySchema,
  createInternalArticleSchema,
  addExternalArticleSchema,
} from "@/lib/validations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertEditRights(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  if (!(await canEditContent(session, ownerType, ownerId))) throw new Error("Forbidden");
  return { session, pub, ownerType: ownerType as "user" | "org", ownerId };
}

// ---------------------------------------------------------------------------
// Book CRUD
// ---------------------------------------------------------------------------

export async function createBook(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = createBookSchema.parse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    ownerType,
    ownerId,
  });

  await db.insert(books).values({
    slug: validated.slug,
    title: validated.title,
    ownerType: validated.ownerType,
    ownerId: validated.ownerId,
  });

  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}/books/${validated.slug}`);
}

export async function deleteBook(publisherSlug: string, formData: FormData) {
  await assertEditRights(publisherSlug);

  const validated = deleteBookSchema.parse({ bookId: formData.get("bookId") });

  // Cascade deletes: curriculumEntries, bookSnapshots, pdfCaches, internal articles
  await db.delete(books).where(eq(books.id, validated.bookId));

  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}`);
}

export async function updateBook(publisherSlug: string, formData: FormData) {
  await assertEditRights(publisherSlug);

  const validated = updateBookSchema.parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    title: formData.get("title"),
  });

  const [current] = await db
    .select({ slug: books.slug })
    .from(books)
    .where(eq(books.id, validated.id))
    .limit(1);

  await db
    .update(books)
    .set({ slug: validated.slug, title: validated.title, updatedAt: new Date() })
    .where(eq(books.id, validated.id));

  if (current) revalidatePath(`/${publisherSlug}/books/${current.slug}`);
  revalidatePath(`/${publisherSlug}/books/${validated.slug}`);
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

  // Security: this entry point is for same-publisher articles only.
  // Cross-publisher articles must go through addExternalArticle, which
  // performs a visibility check rather than an ownership check.
  const [art] = await db
    .select({ ownerType: articles.ownerType, ownerId: articles.ownerId })
    .from(articles)
    .where(eq(articles.id, validated.articleId))
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

  // Find book slug for revalidation
  const [book] = await db.select({ slug: books.slug }).from(books).where(eq(books.id, validated.bookId)).limit(1);
  if (book) revalidatePath(`/${publisherSlug}/books/${book.slug}`);
}

export async function addExternalArticle(
  publisherSlug: string,
  formData: FormData
) {
  // 1. Caller must own the book.
  const { session } = await assertEditRights(publisherSlug);

  // 2. Validate input shape.
  const validated = addExternalArticleSchema.parse({
    bookId: formData.get("bookId"),
    targetPublisher: formData.get("targetPublisher"),
    articleSlug: formData.get("articleSlug"),
    position: formData.get("position"),
    partTitle: formData.get("partTitle") || null,
  });

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

  // 5. Find the article (non-internal only).
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, articleOwnerType),
        eq(articles.ownerId, articleOwnerId),
        eq(articles.slug, validated.articleSlug),
        eq(articles.isInternal, false)
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
  const [book] = await db
    .select({ slug: books.slug })
    .from(books)
    .where(eq(books.id, validated.bookId))
    .limit(1);
  if (book) {
    revalidatePath(`/${publisherSlug}/books/${book.slug}`);
    revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
  }
}

export async function removeCurriculumEntry(publisherSlug: string, formData: FormData) {
  await assertEditRights(publisherSlug);

  const validated = removeCurriculumEntrySchema.parse({
    id: formData.get("id"),
    bookId: formData.get("bookId"),
  });

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

  const [book] = await db.select({ slug: books.slug }).from(books).where(eq(books.id, validated.bookId)).limit(1);
  if (book) {
    revalidatePath(`/${publisherSlug}/books/${book.slug}`);
    revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
  }
}

export async function reorderCurriculumEntries(
  publisherSlug: string,
  bookId: number,
  orderedIds: number[]
) {
  await assertEditRights(publisherSlug);

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(curriculumEntries)
        .set({ position: i })
        .where(eq(curriculumEntries.id, orderedIds[i]));
    }
  });

  const [book] = await db.select({ slug: books.slug }).from(books).where(eq(books.id, bookId)).limit(1);
  if (book) revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
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

  const [book] = await db.select({ slug: books.slug }).from(books).where(eq(books.id, validated.bookId)).limit(1);
  if (book) {
    revalidatePath(`/${publisherSlug}/books/${book.slug}/edit`);
    redirect(`/${publisherSlug}/books/${book.slug}/edit`);
  }
}

// ---------------------------------------------------------------------------
// Book snapshots
// ---------------------------------------------------------------------------

export async function snapshotBook(publisherSlug: string, bookId: number, note?: string) {
  await assertEditRights(publisherSlug);

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
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
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

  const [book] = await db.select({ slug: books.slug }).from(books).where(eq(books.id, bookId)).limit(1);
  if (book) revalidatePath(`/${publisherSlug}/books/${book.slug}/snapshots`);
}
