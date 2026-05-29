import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, curriculumEntries, articles } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { getDailyViews } from "@/lib/analytics-queries";
import SparklineSvg from "@/components/SparklineSvg";
import type { DailyViewRow } from "@/lib/analytics-queries";

export default async function BookAnalyticsPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await getSession();
  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const canEdit = await canEditContent(session, ownerType, ownerId);
  if (!canEdit) notFound();

  // Fetch the book
  const [bookRow] = await db
    .select({ id: books.id, slug: books.slug, title: books.title })
    .from(books)
    .where(
      and(
        eq(books.slug, bookSlug),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!bookRow) notFound();

  // Fetch curriculum entries joined with article metadata
  const entryRows = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: curriculumEntries.articleId,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      deletedAt: articles.deletedAt,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(
      and(
        eq(curriculumEntries.bookId, bookRow.id),
        isNull(articles.deletedAt)
      )
    )
    .orderBy(curriculumEntries.position);

  // Fetch daily views for each chapter article in parallel
  const DAYS = 30;
  const dailyViewsPerArticle: DailyViewRow[][] = await Promise.all(
    entryRows.map((entry) => getDailyViews(entry.articleId, DAYS))
  );

  // Aggregate total views per article over the window
  const articleTotals = dailyViewsPerArticle.map((rows) =>
    rows.reduce((s, r) => s + r.views, 0)
  );

  // Build publisher-level daily aggregate for the sparkline
  const dayMap = new Map<string, number>();
  for (const rows of dailyViewsPerArticle) {
    for (const row of rows) {
      dayMap.set(row.day, (dayMap.get(row.day) ?? 0) + row.views);
    }
  }
  const aggregateTimeline: DailyViewRow[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, views]) => ({ day, views }));

  const totalViews30d = articleTotals.reduce((s, v) => s + v, 0);

  return (
    <main className="themed-container py-8 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link
            href={`/${publisherSlug}/analytics`}
            className="themed-link text-sm"
          >
            &larr; Analytics overview
          </Link>
          <h1 className="text-2xl font-bold mt-1">{bookRow.title}</h1>
        </div>
        <Link
          href={`/${publisherSlug}/books/${bookSlug}`}
          className="themed-link text-sm"
        >
          View book &rarr;
        </Link>
      </div>

      <p className="text-sm opacity-60">
        Showing data for the last {DAYS} days &mdash; {totalViews30d.toLocaleString()} views across{" "}
        {entryRows.length} chapter{entryRows.length !== 1 ? "s" : ""}
      </p>

      {/* Aggregate daily traffic sparkline */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Daily views (last {DAYS} days)</h2>
        <div className="themed-surface rounded-lg p-4 overflow-x-auto">
          <SparklineSvg data={aggregateTimeline} width={560} height={140} />
        </div>
      </section>

      {/* Per-chapter table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Chapters</h2>
        {entryRows.length === 0 ? (
          <p className="opacity-60">No chapters yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b themed-border text-left">
                  <th className="pb-2 pr-4 font-semibold">#</th>
                  <th className="pb-2 pr-4 font-semibold">Chapter</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Views (last {DAYS} days)</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {entryRows.map((entry, i) => (
                  <tr key={entry.articleId} className="border-b themed-border">
                    <td className="py-2 pr-4 tabular-nums opacity-60">
                      {entry.position + 1}
                    </td>
                    <td className="py-2 pr-4">
                      {entry.partTitle && (
                        <span className="block text-xs opacity-60 mb-0.5">{entry.partTitle}</span>
                      )}
                      <Link
                        href={`/${publisherSlug}/articles/${entry.articleSlug}`}
                        className="themed-link hover:underline"
                      >
                        {entry.articleTitle}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {articleTotals[i].toLocaleString()}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/${publisherSlug}/analytics/${entry.articleSlug}`}
                        className="themed-link text-xs hover:underline whitespace-nowrap"
                      >
                        View detail &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
