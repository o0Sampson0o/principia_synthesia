import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { withPartTitles } from "@/lib/curriculum";
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

  const [bookRow] = await db
    .select({ id: books.id, slug: books.slug, title: books.title })
    .from(books)
    .where(
      and(
        eq(books.slug, bookSlug),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNull(books.deletedAt)
      )
    )
    .limit(1);

  if (!bookRow) notFound();

  const entryRows = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: articles.id,
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
    .orderBy(curriculumEntries.position)
    .then((rows) => withPartTitles(rows, bookRow.id));

  const DAYS = 30;
  const dailyViewsPerArticle: DailyViewRow[][] = await Promise.all(
    entryRows.map((entry) => getDailyViews(entry.articleId, DAYS))
  );

  const articleTotals = dailyViewsPerArticle.map((rows) =>
    rows.reduce((s, r) => s + r.views, 0)
  );

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
    <main className="w-full max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16 space-y-14">

      {/* Breadcrumb + header */}
      <div>
        <Link
          href={`/${publisherSlug}/analytics`}
          className="ps-eyebrow inline-flex items-center gap-1.5 mb-5"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
          Analytics
        </Link>

        <h1
          className="ps-display themed-heading mb-3"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
        >
          {bookRow.title}
        </h1>

        <Link
          href={`/${publisherSlug}/books/${bookSlug}`}
          className="themed-nav-link hover:text-[var(--foreground)] transition-colors"
          style={{ fontSize: "0.8125rem" }}
        >
          View book →
        </Link>
      </div>

      {/* Hero stat */}
      <div className="border-t border-b themed-border py-8 flex gap-12 flex-wrap">
        <div>
          <p
            className="themed-heading font-medium tabular-nums"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
          >
            {totalViews30d.toLocaleString()}
          </p>
          <p
            className="themed-muted mt-2.5"
            style={{ fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            Views · {DAYS} days
          </p>
        </div>
        <div>
          <p
            className="themed-heading font-medium tabular-nums"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
          >
            {entryRows.length}
          </p>
          <p
            className="themed-muted mt-2.5"
            style={{ fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            Chapter{entryRows.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Aggregate daily traffic */}
      <section>
        <div className="flex items-baseline justify-between mb-6 pb-4 border-b themed-border">
          <p className="ps-eyebrow-muted">Daily views</p>
          <p className="themed-muted" style={{ fontSize: "0.75rem" }}>Last {DAYS} days · all chapters</p>
        </div>
        <div className="overflow-x-auto">
          <SparklineSvg data={aggregateTimeline} width={560} height={120} />
        </div>
      </section>

      {/* Chapter breakdown — typeset like a table of contents */}
      <section>
        <div className="flex items-baseline justify-between mb-6 pb-4 border-b themed-border">
          <p className="ps-eyebrow-muted">Chapters</p>
          {entryRows.length > 0 && (
            <p className="themed-muted" style={{ fontSize: "0.75rem" }}>{DAYS}-day views</p>
          )}
        </div>
        {entryRows.length === 0 ? (
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>No chapters yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                {entryRows.map((entry, i) => (
                  <tr key={entry.articleId} className="border-b themed-border last:border-0 group">
                    {/* Position number — narrow, footnote-sized */}
                    <td
                      className="py-3.5 pr-5 tabular-nums themed-muted align-top"
                      style={{ fontSize: "0.75rem", width: "2rem", paddingTop: "1.05rem" }}
                    >
                      {entry.position + 1}
                    </td>
                    {/* Chapter title with optional part label */}
                    <td className="py-3.5 pr-8">
                      {entry.partTitle && (
                        <span
                          className="block themed-muted mb-0.5"
                          style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}
                        >
                          {entry.partTitle}
                        </span>
                      )}
                      <Link
                        href={`/${publisherSlug}/articles/${entry.articleSlug}`}
                        className="ps-list-link"
                      >
                        {entry.articleTitle}
                      </Link>
                    </td>
                    {/* Views — right-aligned, dominant in its column */}
                    <td
                      className="py-3.5 pr-5 text-right tabular-nums themed-heading font-medium align-middle"
                      style={{ fontSize: "0.9375rem", whiteSpace: "nowrap" }}
                    >
                      {articleTotals[i].toLocaleString()}
                    </td>
                    {/* Detail link — appears on hover */}
                    <td className="py-3.5 text-right align-middle" style={{ width: "4rem" }}>
                      <Link
                        href={`/${publisherSlug}/analytics/${entry.articleSlug}`}
                        className="themed-nav-link hover:text-[var(--foreground)] transition-colors opacity-0 group-hover:opacity-100 whitespace-nowrap"
                        style={{ fontSize: "0.75rem" }}
                        tabIndex={0}
                      >
                        Detail →
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
