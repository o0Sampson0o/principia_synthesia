import { db } from "@/db";
import { articles, articleViews, books, curriculumEntries } from "@/db/schema";
import { eq, and, gte, count, countDistinct, isNull, sql } from "drizzle-orm";
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
      and(eq(articles.ownerType, ownerType), eq(articles.ownerId, ownerId), isNull(articles.deletedAt))
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

export interface BookStats {
  bookId: number;
  slug: string;
  title: string;
  totalViews: number;
  uniqueViews: number;
  last30dViews: number;
  chapterCount: number;
}

/**
 * Return per-book view statistics for all books owned by a publisher.
 * Views are aggregated across all articles that appear as curriculum entries
 * in each book.
 *
 * @param ownerType - "user" | "org"
 * @param ownerId   - the user or org primary key
 */
export async function getPerBookStats(
  ownerType: string,
  ownerId: number
): Promise<BookStats[]> {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all books for this publisher
  const bookRows = await db
    .select({ id: books.id, slug: books.slug, title: books.title })
    .from(books)
    .where(and(eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)));

  if (bookRows.length === 0) return [];

  const bookIds = bookRows.map((b) => b.id);

  // Fetch curriculum entries to know which articles belong to each book
  const entryRows = await db
    .select({ bookId: curriculumEntries.bookId, articleId: curriculumEntries.articleId })
    .from(curriculumEntries)
    .where(
      sql`${curriculumEntries.bookId} = ANY(ARRAY[${sql.join(bookIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
    );

  if (entryRows.length === 0) {
    return bookRows.map((b) => ({
      bookId: b.id,
      slug: b.slug,
      title: b.title,
      totalViews: 0,
      uniqueViews: 0,
      last30dViews: 0,
      chapterCount: 0,
    }));
  }

  // Build book → article IDs map and chapter count map
  const bookArticleMap = new Map<number, number[]>();
  const chapterCountMap = new Map<number, number>();
  for (const entry of entryRows) {
    const existing = bookArticleMap.get(entry.bookId) ?? [];
    existing.push(entry.articleId);
    bookArticleMap.set(entry.bookId, existing);
    chapterCountMap.set(entry.bookId, (chapterCountMap.get(entry.bookId) ?? 0) + 1);
  }

  const allArticleIds = Array.from(new Set(entryRows.map((e) => e.articleId)));

  // Total views per article
  const totalRows = await db
    .select({
      articleId: articleViews.articleId,
      total: count(articleViews.id),
    })
    .from(articleViews)
    .where(
      sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(allArticleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
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
      sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(allArticleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
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
        sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(allArticleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`,
        gte(articleViews.viewedAt, cutoff30d)
      )
    )
    .groupBy(articleViews.articleId);

  const totalMap = new Map(totalRows.map((r) => [r.articleId, Number(r.total)]));
  const uniqueMap = new Map(uniqueRows.map((r) => [r.articleId, Number(r.unique)]));
  const last30Map = new Map(last30Rows.map((r) => [r.articleId, Number(r.last30)]));

  return bookRows.map((b) => {
    const articleIds = bookArticleMap.get(b.id) ?? [];
    const totalViews = articleIds.reduce((s, id) => s + (totalMap.get(id) ?? 0), 0);
    const uniqueViews = articleIds.reduce((s, id) => s + (uniqueMap.get(id) ?? 0), 0);
    const last30dViews = articleIds.reduce((s, id) => s + (last30Map.get(id) ?? 0), 0);
    return {
      bookId: b.id,
      slug: b.slug,
      title: b.title,
      totalViews,
      uniqueViews,
      last30dViews,
      chapterCount: chapterCountMap.get(b.id) ?? 0,
    };
  });
}

/**
 * Return daily view counts across all articles owned by a publisher for the
 * given time window. Useful for rendering a publisher-level traffic sparkline.
 *
 * @param ownerType - "user" | "org"
 * @param ownerId   - the user or org primary key
 * @param days      - number of days to look back (e.g. 30)
 */
export async function getTimelineStats(
  ownerType: string,
  ownerId: number,
  days: number
): Promise<DailyViewRow[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Fetch all non-deleted article IDs for this publisher
  const articleRows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(eq(articles.ownerType, ownerType), eq(articles.ownerId, ownerId), isNull(articles.deletedAt))
    );

  if (articleRows.length === 0) return [];

  const articleIds = articleRows.map((a) => a.id);

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${articleViews.viewedAt}), 'YYYY-MM-DD')`,
      views: count(articleViews.id),
    })
    .from(articleViews)
    .where(
      and(
        sql`${articleViews.articleId} = ANY(ARRAY[${sql.join(articleIds.map((id) => sql`${id}`), sql`, `)}]::int[])`,
        gte(articleViews.viewedAt, cutoff)
      )
    )
    .groupBy(sql`date_trunc('day', ${articleViews.viewedAt})`)
    .orderBy(sql`date_trunc('day', ${articleViews.viewedAt})`);

  return rows.map((r) => ({ day: r.day, views: Number(r.views) }));
}
