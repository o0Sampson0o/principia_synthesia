import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { getPerArticleStats, getPerBookStats, getTimelineStats } from "@/lib/analytics-queries";
import SparklineSvg from "@/components/SparklineSvg";

export default async function AnalyticsDashboardPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await getSession();
  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const canEdit = await canEditContent(session, ownerType, ownerId);
  if (!canEdit) notFound();

  const [stats, bookStats, timelineData] = await Promise.all([
    getPerArticleStats(ownerType, ownerId),
    getPerBookStats(ownerType, ownerId),
    getTimelineStats(ownerType, ownerId, 30),
  ]);

  const totalViews30d = stats.reduce((s, a) => s + a.last30dViews, 0);
  const totalUniqueAll = stats.reduce((s, a) => s + a.uniqueViews, 0);
  const totalAll = stats.reduce((s, a) => s + a.totalViews, 0);

  return (
    <main className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-16 space-y-14">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="ps-eyebrow mb-2">Analytics</p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            {publisherSlug}
          </h1>
        </div>
        <Link
          href={`/${publisherSlug}`}
          className="themed-nav-link hover:text-[var(--foreground)] transition-colors"
          style={{ fontSize: "0.8125rem" }}
        >
          Profile
        </Link>
      </div>

      {/* Summary stats — editorial hairline grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-lg overflow-hidden"
        style={{ backgroundColor: "var(--border)" }}
      >
        <div className="p-6 sm:p-8" style={{ backgroundColor: "var(--surface)" }}>
          <p
            className="themed-heading font-medium tabular-nums"
            style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
          >
            {totalViews30d.toLocaleString()}
          </p>
          <p
            className="themed-muted mt-2.5"
            style={{ fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            Views · 30 days
          </p>
        </div>
        <div className="p-6 sm:p-8" style={{ backgroundColor: "var(--surface)" }}>
          <p
            className="themed-heading font-medium tabular-nums"
            style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
          >
            {totalUniqueAll.toLocaleString()}
          </p>
          <p
            className="themed-muted mt-2.5"
            style={{ fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            Unique sessions · all time
          </p>
        </div>
        <div className="p-6 sm:p-8" style={{ backgroundColor: "var(--surface)" }}>
          <p
            className="themed-heading font-medium tabular-nums"
            style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
          >
            {totalAll.toLocaleString()}
          </p>
          <p
            className="themed-muted mt-2.5"
            style={{ fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            Total views · all time
          </p>
        </div>
      </div>

      {/* Daily traffic — chart sits bare, no surface box */}
      <section>
        <div className="flex items-baseline justify-between mb-6 pb-4 border-b themed-border">
          <p className="ps-eyebrow-muted">Daily traffic</p>
          <p className="themed-muted" style={{ fontSize: "0.75rem" }}>Last 30 days</p>
        </div>
        <div className="overflow-x-auto">
          <SparklineSvg data={timelineData} width={600} height={120} />
        </div>
      </section>

      {/* Articles table */}
      <section>
        <div className="flex items-baseline justify-between mb-6 pb-4 border-b themed-border">
          <p className="ps-eyebrow-muted">Articles</p>
          {stats.length > 0 && (
            <p className="themed-muted" style={{ fontSize: "0.75rem" }}>{stats.length} total</p>
          )}
        </div>
        {stats.length === 0 ? (
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>No articles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b themed-border">
                  <th className="pb-3 pr-6 text-left themed-muted font-normal" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Title</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Total</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Unique</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>30 days</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {stats
                  .sort((a, b) => b.last30dViews - a.last30dViews)
                  .map((row) => (
                    <tr key={row.articleId} className="border-b themed-border last:border-0 group">
                      <td className="py-3.5 pr-6 max-w-xs">
                        <Link href={`/${publisherSlug}/articles/${row.slug}`} className="ps-list-link">
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-secondary" style={{ fontSize: "0.875rem" }}>
                        {row.totalViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-secondary" style={{ fontSize: "0.875rem" }}>
                        {row.uniqueViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-heading font-medium" style={{ fontSize: "0.9375rem" }}>
                        {row.last30dViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 text-right">
                        <Link
                          href={`/${publisherSlug}/analytics/${row.slug}`}
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

      {/* Books table */}
      <section>
        <div className="flex items-baseline justify-between mb-6 pb-4 border-b themed-border">
          <p className="ps-eyebrow-muted">Books</p>
          {bookStats.length > 0 && (
            <p className="themed-muted" style={{ fontSize: "0.75rem" }}>{bookStats.length} total</p>
          )}
        </div>
        {bookStats.length === 0 ? (
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>No books yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b themed-border">
                  <th className="pb-3 pr-6 text-left themed-muted font-normal" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Title</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Ch.</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Total</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Unique</th>
                  <th className="pb-3 pr-6 text-right themed-muted font-normal whitespace-nowrap" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>30 days</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {bookStats
                  .sort((a, b) => b.last30dViews - a.last30dViews)
                  .map((row) => (
                    <tr key={row.bookId} className="border-b themed-border last:border-0 group">
                      <td className="py-3.5 pr-6 max-w-xs">
                        <Link href={`/${publisherSlug}/books/${row.slug}`} className="ps-list-link">
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-muted" style={{ fontSize: "0.875rem" }}>
                        {row.chapterCount.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-secondary" style={{ fontSize: "0.875rem" }}>
                        {row.totalViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-secondary" style={{ fontSize: "0.875rem" }}>
                        {row.uniqueViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-6 text-right tabular-nums themed-heading font-medium" style={{ fontSize: "0.9375rem" }}>
                        {row.last30dViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 text-right">
                        <Link
                          href={`/${publisherSlug}/analytics/books/${row.slug}`}
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
