import { db } from "@/db";
import { articles, articleViews } from "@/db/schema";
import { eq, and, gte, count, countDistinct, sql } from "drizzle-orm";
import type { ReferrerSource } from "@/lib/analytics-source";

export interface ArticleStats {
  articleId: number;
  slug: string;
  title: string;
  totalViews: number;
  uniqueViews: number;
  last30dViews: number;
}

/**
 * Return per-article view statistics for all articles owned by a publisher.
 *
 * @param ownerType - "user" | "org"
 * @param ownerId   - the user or org primary key
 */
export async function getPerArticleStats(
  ownerType: string,
  ownerId: number
): Promise<ArticleStats[]> {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all published articles for the publisher
  const articleRows = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title })
    .from(articles)
    .where(
      and(eq(articles.ownerType, ownerType), eq(articles.ownerId, ownerId))
    );

  if (articleRows.length === 0) return [];

  const articleIds = articleRows.map((a) => a.id);

  // Total views per article
  const totalRows = await db
    .select({
      articleId: articleViews.articleId,
      total: count(articleViews.id),
    })
    .from(articleViews)
    .where(
      sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(articleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
    )
    .groupBy(articleViews.articleId);

  // Unique sessions per article
  const uniqueRows = await db
    .select({
      articleId: articleViews.articleId,
      unique: countDistinct(articleViews.sessionId),
    })
    .from(articleViews)
    .where(
      sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(articleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
    )
    .groupBy(articleViews.articleId);

  // Last 30d views per article
  const last30Rows = await db
    .select({
      articleId: articleViews.articleId,
      last30: count(articleViews.id),
    })
    .from(articleViews)
    .where(
      and(
        sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(articleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`,
        gte(articleViews.viewedAt, cutoff30d)
      )
    )
    .groupBy(articleViews.articleId);

  const totalMap = new Map(totalRows.map((r) => [r.articleId, Number(r.total)]));
  const uniqueMap = new Map(uniqueRows.map((r) => [r.articleId, Number(r.unique)]));
  const last30Map = new Map(last30Rows.map((r) => [r.articleId, Number(r.last30)]));

  return articleRows.map((a) => ({
    articleId: a.id,
    slug: a.slug,
    title: a.title,
    totalViews: totalMap.get(a.id) ?? 0,
    uniqueViews: uniqueMap.get(a.id) ?? 0,
    last30dViews: last30Map.get(a.id) ?? 0,
  }));
}

export interface DailyViewRow {
  day: string; // YYYY-MM-DD
  views: number;
}

/**
 * Return a daily view count time-series for a single article.
 */
export async function getDailyViews(
  articleId: number,
  days: number
): Promise<DailyViewRow[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${articleViews.viewedAt}), 'YYYY-MM-DD')`,
      views: count(articleViews.id),
    })
    .from(articleViews)
    .where(
      and(eq(articleViews.articleId, articleId), gte(articleViews.viewedAt, cutoff))
    )
    .groupBy(sql`date_trunc('day', ${articleViews.viewedAt})`)
    .orderBy(sql`date_trunc('day', ${articleViews.viewedAt})`);

  return rows.map((r) => ({ day: r.day, views: Number(r.views) }));
}

/**
 * Return a breakdown of views by referrer source for a single article.
 */
export async function getSourceBreakdown(
  articleId: number,
  days: number
): Promise<Record<ReferrerSource, number>> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      source: articleViews.referrerSource,
      views: count(articleViews.id),
    })
    .from(articleViews)
    .where(
      and(eq(articleViews.articleId, articleId), gte(articleViews.viewedAt, cutoff))
    )
    .groupBy(articleViews.referrerSource);

  const result: Record<ReferrerSource, number> = {
    direct: 0,
    search: 0,
    social: 0,
    internal: 0,
    external: 0,
  };

  for (const row of rows) {
    // NULL referrerSource (legacy rows with no source data) count as "direct"
    const src = (row.source ?? "direct") as ReferrerSource;
    if (src in result) result[src] += Number(row.views);
  }

  return result;
}
