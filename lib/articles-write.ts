import { createHash } from "crypto";
import { db } from "@/db";
import { articles, revisions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { parseFrontmatter } from "@/lib/frontmatter";
import { setContentTags } from "@/lib/content-tags";
import { createSnapshotIfPublished } from "@/lib/article-snapshots";
import { syncArticleCitations } from "@/lib/citations-sync";
import { notify, resolveArticleAuthors, type ArticleCitedPayload } from "@/lib/notifications";
import type { SessionPayload } from "@/lib/auth";

/**
 * Shared write core for article create/update/delete.
 *
 * Both the web editor's server actions (app/[publisher]/articles/actions.ts)
 * and the sync REST API (app/api/v1) go through these functions so the write
 * invariants live in exactly one place:
 *
 *   parseFrontmatter → revisions row (update) → articles write (metadata
 *   mirror, updatedAt, draft cleared, lastVerifiedAt when published) →
 *   setContentTags → createSnapshotIfPublished → syncArticleCitations +
 *   cited-author notifications.
 *
 * No "use server", no redirect/revalidate here — callers own those.
 */

/** Thrown by updateArticleCore/deleteArticleCore when `expectedBaseHash` no longer matches the stored content. */
export class ArticleConflictError extends Error {
  constructor(
    public remoteContentHash: string,
    public remoteUpdatedAt: Date | null
  ) {
    super("Article content changed since the provided base version");
    this.name = "ArticleConflictError";
  }
}

/** Thrown when the target article does not exist under the given owner (only when a strict precondition is requested). */
export class ArticleSlugTakenError extends Error {
  constructor() {
    super("An article with this slug already exists for this publisher");
    this.name = "ArticleSlugTakenError";
  }
}

export class ArticleNotFoundError extends Error {
  constructor() {
    super("Article not found");
    this.name = "ArticleNotFoundError";
  }
}

/** Same hash recipe as article snapshots: sha256 hex of the exact content string. */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Merge explicit category slugs with frontmatter tags, deduped, order-preserving. */
function mergeCategorySlugs(extra: string[] | undefined, tags: string[]): string[] {
  return [...(extra ?? []), ...tags].filter((v, i, arr) => arr.indexOf(v) === i);
}

/** Sync internal citations and notify newly-cited authors. Notification failures are swallowed. */
async function syncCitationsAndNotify(opts: {
  articleId: number;
  publisherSlug: string;
  slug: string;
  title: string;
  content: string;
}): Promise<void> {
  const syncResult = await syncArticleCitations(opts.articleId, opts.content);
  if (syncResult.added.length === 0) return;

  for (const citedId of syncResult.added) {
    const [citedRow] = await db
      .select({ ownerType: articles.ownerType, ownerId: articles.ownerId, slug: articles.slug })
      .from(articles)
      .where(and(eq(articles.id, citedId), isNull(articles.deletedAt)))
      .limit(1);
    if (!citedRow) continue;
    const recipients = await resolveArticleAuthors(citedRow.ownerType, citedRow.ownerId);
    const payload: ArticleCitedPayload = {
      citingArticleId: opts.articleId,
      citingPublisherSlug: opts.publisherSlug,
      citingSlug: opts.slug,
      citingTitle: opts.title,
      citedSlug: citedRow.slug,
    };
    await Promise.all(
      recipients.map((uid) => notify(uid, "article_cited", payload).catch(() => {}))
    );
  }
}

export interface CreateArticleCoreInput {
  actor: SessionPayload;
  ownerType: "user" | "org";
  ownerId: number;
  publisherSlug: string;
  slug: string;
  title: string;
  summary?: string;
  content?: string;
  /** Category slugs beyond the frontmatter tags (the web editor's CategoryPicker). */
  extraCategorySlugs?: string[];
}

export async function createArticleCore(input: CreateArticleCoreInput): Promise<{
  id: number;
  slug: string;
  contentHash: string;
  updatedAt: Date;
}> {
  const parsed = parseFrontmatter(input.content ?? "");
  const categorySlugs = mergeCategorySlugs(input.extraCategorySlugs, parsed.metadata.tags);
  const isPublished = parsed.metadata.status === "published";

  const [article] = await db
    .insert(articles)
    .values({
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      content: input.content,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      metadata: parsed.metadata,
      ...(isPublished ? { lastVerifiedAt: new Date() } : {}),
    })
    .returning({ id: articles.id, updatedAt: articles.updatedAt });

  await setContentTags("article", article.id, categorySlugs, input.actor.userId);

  await createSnapshotIfPublished(article.id, {
    title: input.title,
    summary: input.summary ?? null,
    content: input.content ?? "",
    metadata: parsed.metadata,
  });

  await syncCitationsAndNotify({
    articleId: article.id,
    publisherSlug: input.publisherSlug,
    slug: input.slug,
    title: input.title,
    content: input.content ?? "",
  });

  return {
    id: article.id,
    slug: input.slug,
    contentHash: computeContentHash(input.content ?? ""),
    updatedAt: article.updatedAt ?? new Date(),
  };
}

export interface UpdateArticleCoreInput {
  actor: SessionPayload;
  ownerType: "user" | "org";
  ownerId: number;
  publisherSlug: string;
  id: number;
  slug: string;
  title: string;
  summary?: string;
  content?: string;
  editNote?: string;
  extraCategorySlugs?: string[];
  /**
   * Optimistic-concurrency precondition: sha256 of the content the caller
   * based its edit on. When provided, the update is rejected with
   * ArticleConflictError if the stored content hashes differently, and with
   * ArticleNotFoundError if the article doesn't exist — both checked before
   * any write.
   */
  expectedBaseHash?: string;
}

export async function updateArticleCore(input: UpdateArticleCoreInput): Promise<{
  contentHash: string;
  updatedAt: Date;
  /** The pre-update row (for redirect decisions on internal articles); undefined if it didn't exist. */
  current: typeof articles.$inferSelect | undefined;
}> {
  const parsedFm = parseFrontmatter(input.content ?? "");
  const categorySlugs = mergeCategorySlugs(input.extraCategorySlugs, parsedFm.metadata.tags);

  const [current] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.id, input.id),
        eq(articles.ownerType, input.ownerType),
        eq(articles.ownerId, input.ownerId)
      )
    )
    .limit(1);

  if (input.expectedBaseHash !== undefined) {
    if (!current) throw new ArticleNotFoundError();
    const remoteHash = computeContentHash(current.content ?? "");
    if (remoteHash !== input.expectedBaseHash) {
      throw new ArticleConflictError(remoteHash, current.updatedAt);
    }
  }

  // Renames must fail cleanly BEFORE the revision insert, or a rejected
  // rename would still pollute revision history.
  if (current && input.slug !== current.slug) {
    // Mirror the partial unique indexes on `articles`: a section only has to be
    // unique inside its own book, a standalone article publisher-wide. Checking
    // publisher-wide for everything would reject renames the database allows.
    const [taken] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.ownerType, input.ownerType),
          eq(articles.ownerId, input.ownerId),
          eq(articles.slug, input.slug),
          current.parentBookId === null
            ? isNull(articles.parentBookId)
            : eq(articles.parentBookId, current.parentBookId)
        )
      )
      .limit(1);
    if (taken && taken.id !== input.id) throw new ArticleSlugTakenError();
  }

  if (current?.content) {
    await db.insert(revisions).values({
      articleId: input.id,
      content: current.content,
      editNote: input.editNote || "Updated",
    });
  }

  const isPublishedUpdate = parsedFm.metadata.status === "published";
  const now = new Date();

  await db
    .update(articles)
    .set({
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      content: input.content,
      metadata: parsedFm.metadata,
      updatedAt: now,
      // A real save promotes the working copy to the live version, so any
      // pending draft is now obsolete.
      draftContent: null,
      draftSavedAt: null,
      ...(isPublishedUpdate ? { lastVerifiedAt: now } : {}),
    })
    .where(
      and(
        eq(articles.id, input.id),
        eq(articles.ownerType, input.ownerType),
        eq(articles.ownerId, input.ownerId)
      )
    );

  await setContentTags("article", input.id, categorySlugs, input.actor.userId);

  await createSnapshotIfPublished(input.id, {
    title: input.title,
    summary: input.summary ?? null,
    content: input.content ?? "",
    metadata: parsedFm.metadata,
  });

  await syncCitationsAndNotify({
    articleId: input.id,
    publisherSlug: input.publisherSlug,
    slug: input.slug,
    title: input.title,
    content: input.content ?? "",
  });

  return {
    contentHash: computeContentHash(input.content ?? ""),
    updatedAt: now,
    current,
  };
}

export interface DeleteArticleCoreInput {
  ownerType: "user" | "org";
  ownerId: number;
  id: number;
  /** Same precondition semantics as updateArticleCore. */
  expectedBaseHash?: string;
}

/** Soft-deletes the article. Returns whether a matching row existed. */
export async function deleteArticleCore(input: DeleteArticleCoreInput): Promise<{ found: boolean }> {
  if (input.expectedBaseHash !== undefined) {
    const [current] = await db
      .select({ content: articles.content, updatedAt: articles.updatedAt })
      .from(articles)
      .where(
        and(
          eq(articles.id, input.id),
          eq(articles.ownerType, input.ownerType),
          eq(articles.ownerId, input.ownerId),
          isNull(articles.deletedAt)
        )
      )
      .limit(1);
    if (!current) throw new ArticleNotFoundError();
    const remoteHash = computeContentHash(current.content ?? "");
    if (remoteHash !== input.expectedBaseHash) {
      throw new ArticleConflictError(remoteHash, current.updatedAt);
    }
  }

  const updated = await db
    .update(articles)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(articles.id, input.id),
        eq(articles.ownerType, input.ownerType),
        eq(articles.ownerId, input.ownerId)
      )
    )
    .returning({ id: articles.id });

  return { found: updated.length > 0 };
}
