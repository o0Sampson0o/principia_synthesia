"use server";

import { db } from "@/db";
import { articles, revisions, articleCategories, categories } from "@/db/schema";
import { setContentTags } from "@/lib/content-tags";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { parseFrontmatter } from "@/lib/frontmatter";
import {
  createArticleSchema,
  updateArticleSchema,
  deleteArticleSchema,
  restoreRevisionSchema,
  markArticleVerifiedSchema,
} from "@/lib/validations";
import { createSnapshotIfPublished } from "@/lib/article-snapshots";
import { createArticleCore, updateArticleCore, deleteArticleCore, ArticleSlugTakenError } from "@/lib/articles-write";
import { isUniqueViolation } from "@/lib/db-errors";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkQuoteAttribution } from "@/lib/remark-quote-attribution";
import { normalizeDetailsBlocks } from "@/lib/normalize-details";

// ---------------------------------------------------------------------------
// Preview compilation (server-side — eliminates unsafe-eval in the browser)
// ---------------------------------------------------------------------------

export async function previewMdx(
  source: string
): Promise<{ html: string } | { error: string }> {
  await requireSession();
  try {
    const file = await unified()
      .use(remarkParse)
      .use(remarkMath)
      .use(remarkGfm)
      .use(remarkCallouts)
      .use(remarkQuoteAttribution)
      .use(remarkWikilinks)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeSlug)
      .use(rehypeKatex)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(normalizeDetailsBlocks(source));
    return { html: String(file) };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolvePublisherOrThrow(publisherSlug: string) {
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  return pub;
}

export async function assertEditRights(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisherOrThrow(publisherSlug);
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  if (!(await canEditContent(session, ownerType, ownerId))) {
    throw new Error("Forbidden");
  }
  return { session, pub, ownerType: ownerType as "user" | "org", ownerId };
}


// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createArticle(
  publisherSlug: string,
  formData: FormData
): Promise<{ error: string } | void> {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = createArticleSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    categories: formData.get("categories"),
  });

  try {
    await createArticleCore({
      actor: session,
      ownerType,
      ownerId,
      publisherSlug,
      slug: validated.slug,
      title: validated.title,
      summary: validated.summary,
      content: validated.content,
      extraCategorySlugs: validated.categories?.split(",").filter(Boolean),
    });
  } catch (err) {
    // Duplicate slug (including one held by a binned article) is a user
    // mistake, not a crash — returned (not redirected) so the form keeps
    // its scroll position and typed values.
    if (isUniqueViolation(err)) {
      return { error: "An article with this slug already exists (it may be in the bin). Pick a different slug." };
    }
    throw err;
  }

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}/articles/${validated.slug}`);
}

export async function updateArticle(
  publisherSlug: string,
  prevState: unknown,
  formData: FormData
) {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);

  let validated: ReturnType<typeof updateArticleSchema.parse>;
  try {
    // formData.get() returns null for missing fields; convert to undefined
    // so z.string().optional() accepts them.
    validated = updateArticleSchema.parse({
      id: formData.get("id"),
      title: formData.get("title"),
      slug: formData.get("slug"),
      summary: formData.get("summary") ?? undefined,
      content: formData.get("content") ?? undefined,
      categories: formData.get("categories") ?? undefined,
    });
  } catch (err: unknown) {
    const zodErr = err as { name?: string; issues?: { path: string[]; message: string }[] };
    if (zodErr?.name === "ZodError" && zodErr.issues) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of zodErr.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return { error: fieldErrors };
    }
    throw err;
  }

  let current;
  try {
    ({ current } = await updateArticleCore({
      actor: session,
      ownerType,
      ownerId,
      publisherSlug,
      id: validated.id,
      slug: validated.slug,
      title: validated.title,
      summary: validated.summary,
      content: validated.content,
      editNote: (formData.get("editNote") as string) || undefined,
      extraCategorySlugs: validated.categories?.split(",").filter(Boolean),
    }));
  } catch (err) {
    if (err instanceof ArticleSlugTakenError || isUniqueViolation(err)) {
      return { error: { slug: "Another article already uses that slug. Choose a different one." } };
    }
    throw err;
  }

  if (current?.isInternal && current?.parentBookId) {
    // Find the book slug for the redirect
    const { books } = await import("@/db/schema");
    const [bookRow] = await db
      .select({ slug: books.slug })
      .from(books)
      .where(eq(books.id, current.parentBookId))
      .limit(1);
    if (bookRow) {
      revalidatePath(`/${publisherSlug}/books/${bookRow.slug}/${validated.slug}`);
      redirect(`/${publisherSlug}/books/${bookRow.slug}/${validated.slug}`);
    }
  }

  revalidatePath(`/${publisherSlug}/articles/${validated.slug}`);
  revalidatePath(`/${publisherSlug}/articles/${validated.slug}/edit`);
  redirect(`/${publisherSlug}/articles/${validated.slug}`);
}

export async function deleteArticle(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = deleteArticleSchema.parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
  });

  await deleteArticleCore({ ownerType, ownerId, id: validated.id });

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}/bin`);
}

export async function restoreRevision(formData: FormData) {
  const validated = restoreRevisionSchema.parse({
    revisionId: formData.get("revisionId"),
    articleId: formData.get("articleId"),
    publisherSlug: formData.get("publisherSlug"),
  });

  const { session: restoreSession, ownerType: restoreOwnerType, ownerId: restoreOwnerId } = await assertEditRights(validated.publisherSlug);

  const [article] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.id, validated.articleId),
        eq(articles.ownerType, restoreOwnerType),
        eq(articles.ownerId, restoreOwnerId),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);
  if (!article) throw new Error("Article not found");

  const [revision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.id, validated.revisionId), eq(revisions.articleId, validated.articleId)))
    .limit(1);
  if (!revision) throw new Error("Revision not found");

  await db.insert(revisions).values({
    articleId: validated.articleId,
    content: article.content || "",
    editNote: "Before restore",
  });

  const restoredFm = parseFrontmatter(revision.content ?? "");
  const isRestoredPublished = restoredFm.metadata.status === "published";
  await db
    .update(articles)
    .set({
      content: revision.content,
      metadata: restoredFm.metadata,
      updatedAt: new Date(),
      draftContent: null,
      draftSavedAt: null,
      ...(isRestoredPublished ? { lastVerifiedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(articles.id, validated.articleId),
        eq(articles.ownerType, restoreOwnerType),
        eq(articles.ownerId, restoreOwnerId)
      )
    );

  // Merge existing CategoryPicker tags with frontmatter tags from the restored content
  // so that tags set via the picker are never silently wiped by a restore.
  const existingCats = await db
    .select({ slug: categories.slug })
    .from(articleCategories)
    .innerJoin(categories, eq(articleCategories.categoryId, categories.id))
    .where(eq(articleCategories.articleId, validated.articleId));
  const mergedSlugs = [...new Set([...existingCats.map((c) => c.slug), ...restoredFm.metadata.tags])];
  await setContentTags("article", validated.articleId, mergedSlugs, restoreSession.userId);

  await createSnapshotIfPublished(validated.articleId, {
    title: article.title,
    summary: article.summary ?? null,
    content: revision.content ?? "",
    metadata: restoredFm.metadata,
  });

  if (article.isInternal && article.parentBookId) {
    const { books } = await import("@/db/schema");
    const [bookRow] = await db
      .select({ slug: books.slug })
      .from(books)
      .where(eq(books.id, article.parentBookId))
      .limit(1);
    if (bookRow) {
      revalidatePath(`/${validated.publisherSlug}/books/${bookRow.slug}/${article.slug}`);
      redirect(`/${validated.publisherSlug}/books/${bookRow.slug}/${article.slug}`);
    }
  }

  revalidatePath(`/${validated.publisherSlug}/articles/${article.slug}`);
  revalidatePath(`/${validated.publisherSlug}/articles/${article.slug}/edit`);
  redirect(`/${validated.publisherSlug}/articles/${article.slug}`);
}

/**
 * Save the editor's current content as an unsaved draft copy.
 *
 * The draft is stored alongside the live article (in `draftContent`) and is
 * NOT promoted to the published `content` — visitors keep seeing the last real
 * save. The editor loads the draft on its next open. Intentionally performs no
 * redirect and creates no revision, so the author stays in the editor.
 */
export async function saveArticleDraft(
  publisherSlug: string,
  slug: string,
  content: string
): Promise<{ ok: true; savedAt: string }> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const savedAt = new Date();
  await db
    .update(articles)
    .set({ draftContent: content, draftSavedAt: savedAt })
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    );

  // Refresh the edit page so a reload reflects the saved draft, but leave the
  // public article page untouched (its content has not changed).
  revalidatePath(`/${publisherSlug}/articles/${slug}/edit`);

  return { ok: true, savedAt: savedAt.toISOString() };
}

/**
 * Discard the unsaved draft copy and revert the editor to the published version.
 */
export async function discardArticleDraft(
  publisherSlug: string,
  slug: string
): Promise<void> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  await db
    .update(articles)
    .set({ draftContent: null, draftSavedAt: null })
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    );

  revalidatePath(`/${publisherSlug}/articles/${slug}/edit`);
}

/**
 * Mark an article as verified (resets the staleness clock).
 * Only editors can call this.
 */
export async function markArticleVerified(
  publisherSlug: string,
  formData: FormData
): Promise<void> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = markArticleVerifiedSchema.parse({
    articleId: formData.get("articleId"),
    publisherSlug: formData.get("publisherSlug") ?? publisherSlug,
  });

  await db
    .update(articles)
    .set({ lastVerifiedAt: new Date() })
    .where(and(eq(articles.id, validated.articleId), eq(articles.ownerType, ownerType), eq(articles.ownerId, ownerId), isNull(articles.deletedAt)));

  revalidatePath(`/${publisherSlug}`);
}
