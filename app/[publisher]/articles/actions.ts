"use server";

import { db } from "@/db";
import {
  articles,
  revisions,
  categories,
  articleCategories,
  orgMemberships,
  publishers,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
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
import { syncArticleCitations } from "@/lib/citations-sync";
import { notify, type ArticleCitedPayload } from "@/lib/notifications";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { remarkWikilinks } from "@/lib/remark-wikilinks";

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
      .use(remarkWikilinks)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeKatex)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(source);
    return { html: String(file) };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve notification recipients for an article owner.
 * User-owned → [ownerUserId]. Org-owned → super_admin + admin userIds.
 */
async function resolveArticleAuthors(ownerType: string, ownerId: number): Promise<number[]> {
  if (ownerType === "user") return [ownerId];
  const members = await db
    .select({ userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(
      sql`${orgMemberships.orgId} = ${ownerId} AND ${orgMemberships.role} IN ('super_admin', 'admin')`
    );
  return members.map((m) => m.userId);
}

async function resolvePublisherOrThrow(publisherSlug: string) {
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  return pub;
}

async function assertEditRights(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisherOrThrow(publisherSlug);
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  if (!(await canEditContent(session, ownerType, ownerId))) {
    throw new Error("Forbidden");
  }
  return { session, pub, ownerType: ownerType as "user" | "org", ownerId };
}

async function setArticleCategories(articleId: number, slugs: string[]) {
  if (slugs.length > 0) {
    for (const slug of slugs) {
      const existing = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);
      if (!existing[0]) {
        await db.insert(categories).values({ slug, name: slug });
      }
    }
  }
  await db.delete(articleCategories).where(eq(articleCategories.articleId, articleId));
  if (slugs.length > 0) {
    const cats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.slug, slugs));
    if (cats.length > 0) {
      await db.insert(articleCategories).values(
        cats.map((c) => ({ articleId, categoryId: c.id }))
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createArticle(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = createArticleSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    categories: formData.get("categories"),
  });

  const categorySlugs = validated.categories?.split(",").filter(Boolean) ?? [];
  const parsed = parseFrontmatter(validated.content ?? "");

  const isPublished = parsed.metadata.status === "published";

  const [article] = await db
    .insert(articles)
    .values({
      title: validated.title,
      slug: validated.slug,
      summary: validated.summary,
      content: validated.content,
      ownerType,
      ownerId,
      metadata: parsed.metadata,
      ...(isPublished ? { lastVerifiedAt: new Date() } : {}),
    })
    .returning({ id: articles.id });

  await setArticleCategories(article.id, categorySlugs);

  await createSnapshotIfPublished(article.id, {
    title: validated.title,
    summary: validated.summary ?? null,
    content: validated.content ?? "",
    metadata: parsed.metadata,
  });

  // Sync internal citations and notify newly-cited authors
  {
    const syncResult = await syncArticleCitations(article.id, validated.content ?? "");
    if (syncResult.added.length > 0) {
      for (const citedId of syncResult.added) {
        const [citedRow] = await db.select({ ownerType: articles.ownerType, ownerId: articles.ownerId, slug: articles.slug }).from(articles).where(eq(articles.id, citedId)).limit(1);
        if (!citedRow) continue;
        const recipients = await resolveArticleAuthors(citedRow.ownerType, citedRow.ownerId);
        const payload: ArticleCitedPayload = {
          citingArticleId: article.id,
          citingPublisherSlug: publisherSlug,
          citingSlug: validated.slug,
          citingTitle: validated.title,
          citedSlug: citedRow.slug,
        };
        await Promise.all(recipients.map((uid) => notify(uid, "article_cited", payload).catch(() => {})));
      }
    }
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
  await assertEditRights(publisherSlug);

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

  const categorySlugs = validated.categories?.split(",").filter(Boolean) ?? [];
  const parsedFm = parseFrontmatter(validated.content ?? "");

  const [current] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, validated.id))
    .limit(1);

  if (current?.content) {
    await db.insert(revisions).values({
      articleId: validated.id,
      content: current.content,
      editNote: (formData.get("editNote") as string) || "Updated",
    });
  }

  const isPublishedUpdate = parsedFm.metadata.status === "published";

  await db
    .update(articles)
    .set({
      title: validated.title,
      slug: validated.slug,
      summary: validated.summary,
      content: validated.content,
      metadata: parsedFm.metadata,
      updatedAt: new Date(),
      ...(isPublishedUpdate ? { lastVerifiedAt: new Date() } : {}),
    })
    .where(eq(articles.id, validated.id));

  await setArticleCategories(validated.id, categorySlugs);

  await createSnapshotIfPublished(validated.id, {
    title: validated.title,
    summary: validated.summary ?? null,
    content: validated.content ?? "",
    metadata: parsedFm.metadata,
  });

  // Sync internal citations and notify newly-cited authors
  {
    const syncResult = await syncArticleCitations(validated.id, validated.content ?? "");
    if (syncResult.added.length > 0) {
      for (const citedId of syncResult.added) {
        const [citedRow] = await db.select({ ownerType: articles.ownerType, ownerId: articles.ownerId, slug: articles.slug }).from(articles).where(eq(articles.id, citedId)).limit(1);
        if (!citedRow) continue;
        const recipients = await resolveArticleAuthors(citedRow.ownerType, citedRow.ownerId);
        const payload: ArticleCitedPayload = {
          citingArticleId: validated.id,
          citingPublisherSlug: publisherSlug,
          citingSlug: validated.slug,
          citingTitle: validated.title,
          citedSlug: citedRow.slug,
        };
        await Promise.all(recipients.map((uid) => notify(uid, "article_cited", payload).catch(() => {})));
      }
    }
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
  await assertEditRights(publisherSlug);

  const validated = deleteArticleSchema.parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
  });

  await db.delete(articles).where(eq(articles.id, validated.id));

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}`);
}

export async function restoreRevision(formData: FormData) {
  const validated = restoreRevisionSchema.parse({
    revisionId: formData.get("revisionId"),
    articleId: formData.get("articleId"),
    publisherSlug: formData.get("publisherSlug"),
  });

  await assertEditRights(validated.publisherSlug);

  const [revision] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.id, validated.revisionId))
    .limit(1);
  if (!revision) throw new Error("Revision not found");

  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, validated.articleId))
    .limit(1);
  if (!article) throw new Error("Article not found");

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
      ...(isRestoredPublished ? { lastVerifiedAt: new Date() } : {}),
    })
    .where(eq(articles.id, validated.articleId));

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

export async function updateArticleContent(
  publisherSlug: string,
  slug: string,
  content: string
): Promise<{ ok: true }> {
  await assertEditRights(publisherSlug);

  const parsed = parseFrontmatter(content);

  await db
    .update(articles)
    .set({ content, metadata: parsed.metadata, updatedAt: new Date() })
    .where(eq(articles.slug, slug));

  revalidatePath(`/${publisherSlug}/articles/${slug}`);
  revalidatePath(`/${publisherSlug}/articles/${slug}/edit`);

  return { ok: true };
}

/**
 * Mark an article as verified (resets the staleness clock).
 * Only editors can call this.
 */
export async function markArticleVerified(
  publisherSlug: string,
  formData: FormData
): Promise<void> {
  await assertEditRights(publisherSlug);

  const validated = markArticleVerifiedSchema.parse({
    articleId: formData.get("articleId"),
    publisherSlug: formData.get("publisherSlug") ?? publisherSlug,
  });

  await db
    .update(articles)
    .set({ lastVerifiedAt: new Date() })
    .where(eq(articles.id, validated.articleId));

  revalidatePath(`/${publisherSlug}`);
}
