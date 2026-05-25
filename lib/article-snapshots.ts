import { createHash } from "crypto";
import { db } from "@/db";
import { articleSnapshots } from "@/db/schema";
import { and, eq, like } from "drizzle-orm";
import type { ArticleMetadataShape } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnapshotInput = {
  title: string;
  summary: string | null;
  content: string;
  metadata: ArticleMetadataShape;
};

export type SnapshotRow = {
  id: number;
  shortHash: string;
  title: string;
  summary: string | null;
  content: string;
  metadata: ArticleMetadataShape;
  publishedAt: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a publish-time snapshot if the article's status is "published".
 * Skips silently (via `onConflictDoNothing`) if identical content was already
 * snapshotted (same contentHash).
 *
 * Returns `{ created: false, shortHash: null }` when not published or on
 * no-op dedupe.
 */
export async function createSnapshotIfPublished(
  articleId: number,
  next: SnapshotInput
): Promise<{ created: boolean; shortHash: string | null }> {
  if (next.metadata.status !== "published") {
    return { created: false, shortHash: null };
  }

  const contentHash = createHash("sha256").update(next.content).digest("hex");
  const shortHash = contentHash.slice(0, 7);

  await db
    .insert(articleSnapshots)
    .values({
      articleId,
      contentHash,
      shortHash,
      title: next.title,
      summary: next.summary,
      content: next.content,
      metadata: next.metadata,
    })
    .onConflictDoNothing();

  return { created: true, shortHash };
}

/**
 * Resolve a short hash prefix to a snapshot row.
 * Returns `null` when:
 * - no snapshot matches the prefix
 * - multiple snapshots match (ambiguous prefix → safer to 404 than guess)
 */
export async function getSnapshotByShortHash(
  articleId: number,
  shortHash: string
): Promise<SnapshotRow | null> {
  const rows = await db
    .select()
    .from(articleSnapshots)
    .where(
      and(
        eq(articleSnapshots.articleId, articleId),
        like(articleSnapshots.shortHash, `${shortHash}%`)
      )
    );

  if (rows.length !== 1) return null;

  const row = rows[0];
  return {
    id: row.id,
    shortHash: row.shortHash,
    title: row.title,
    summary: row.summary ?? null,
    content: row.content,
    metadata: row.metadata as ArticleMetadataShape,
    publishedAt: row.publishedAt,
  };
}

/**
 * List all snapshots for an article, ordered newest first.
 */
export async function listSnapshots(
  articleId: number
): Promise<Array<{ id: number; shortHash: string; publishedAt: Date }>> {
  const rows = await db
    .select({
      id: articleSnapshots.id,
      shortHash: articleSnapshots.shortHash,
      publishedAt: articleSnapshots.publishedAt,
    })
    .from(articleSnapshots)
    .where(eq(articleSnapshots.articleId, articleId))
    .orderBy(articleSnapshots.publishedAt);

  return rows.map((r) => ({
    id: r.id,
    shortHash: r.shortHash,
    publishedAt: r.publishedAt,
  }));
}
