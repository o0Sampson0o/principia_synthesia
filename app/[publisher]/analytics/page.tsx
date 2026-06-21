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

  const sortedStats = [...stats].sort((a, b) => b.last30dViews - a.last30dViews);
  const sortedBookStats = [...bookStats].sort((a, b) => b.last30dViews - a.last30dViews);

  const thStyle: React.CSSProperties = {
    fontSize: "0.5625rem",
    fontFamily: "ui-monospace, monospace",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontWeight: 400,
  };

  return (
    <main className="flex-1">

      {/* ── Command center: header + stats + chart, all framed ────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">

          {/* Header row */}
          <div
            className="flex items-center justify-between py-5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-baseline gap-2.5">
              <p className="ps-eyebrow">Analytics</p>
              <span className="themed-muted" style={{ fontSize: "0.625rem" }}>·</span>
              <span
                className="themed-muted"
                style={{ fontSize: "0.8125rem", fontFamily: "ui-monospace, monospace", letterSpacing: "0.03em" }}
              >
                @{publisherSlug}
              </span>
            </div>
            <Link
              href={`/${publisherSlug}`}
              className="themed-nav-link hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
              style={{ fontSize: "0.8125rem" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5m7-7-7 7 7 7" />
              </svg>
              Profile
            </Link>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x themed-border py-8">

            {/* Hero stat — 30-day views */}
            <div className="pb-7 sm:pb-0 sm:pr-10">
              <p
                className="themed-heading font-medium tabular-nums"
                style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", letterSpacing: "-0.045em", lineHeight: 1 }}
              >
                {totalViews30d.toLocaleString()}
              </p>
              <p
                className="themed-muted mt-3"
                style={{ fontSize: "0.5625rem", fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}
              >
                Views · 30 days
              </p>
            </div>

            {/* Unique sessions */}
            <div className="py-7 sm:py-0 sm:px-10">
              <p
                className="themed-heading font-medium tabular-nums"
                style={{ fontSize: "clamp(1.625rem, 3.5vw, 2.375rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
              >
                {totalUniqueAll.toLocaleString()}
              </p>
              <p
                className="themed-muted mt-3"
                style={{ fontSize: "0.5625rem", fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}
              >
                Unique sessions · all time
              </p>
            </div>

            {/* Total views */}
            <div className="pt-7 sm:pt-0 sm:pl-10">
              <p
                className="themed-heading font-medium tabular-nums"
                style={{ fontSize: "clamp(1.625rem, 3.5vw, 2.375rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
              >
                {totalAll.toLocaleString()}
              </p>
              <p
                className="themed-muted mt-3"
                style={{ fontSize: "0.5625rem", fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}
              >
                Total views · all time
              </p>
            </div>

          </div>

          {/* Sparkline — full width inside the frame */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-baseline justify-between py-4">
              <p className="ps-eyebrow-muted">Daily traffic</p>
              <p
                className="themed-muted"
                style={{ fontSize: "0.5625rem", fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}
              >
                Last 30 days
              </p>
            </div>
            <div className="overflow-x-auto pb-6">
              <SparklineSvg data={timelineData} width={600} height={120} />
            </div>
          </div>

        </div>
      </div>

      {/* ── Content tables — editorial index ─────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12 space-y-14">

        {/* Articles */}
        <section>
          <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
            <p className="ps-eyebrow-muted">Articles</p>
            {stats.length > 0 && (
              <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
                {stats.length}
              </span>
            )}
          </div>

          {stats.length === 0 ? (
            <p className="themed-muted py-8" style={{ fontSize: "0.9375rem" }}>No articles yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b themed-border">
                    <th className="pb-3 pr-4 text-left themed-muted" style={thStyle}>Title</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>Total</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>Unique</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>30 days</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((row, i) => (
                    <tr key={row.articleId} className="border-b themed-border last:border-0 group">
                      <td className="py-3.5 pr-4">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span
                            className="shrink-0 tabular-nums select-none"
                            style={{ fontSize: "0.5625rem", fontFamily: "ui-monospace, monospace", color: "var(--muted-foreground)", letterSpacing: "0.05em" }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Link
                            href={`/${publisherSlug}/articles/${row.slug}`}
                            className="ps-list-link truncate"
                            style={{ minWidth: 0 }}
                          >
                            {row.title}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-muted" style={{ fontSize: "0.875rem" }}>
                        {row.totalViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-muted" style={{ fontSize: "0.875rem" }}>
                        {row.uniqueViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-heading font-medium" style={{ fontSize: "1rem" }}>
                        {row.last30dViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/${publisherSlug}/analytics/${row.slug}`}
                          className="themed-nav-link hover:text-[var(--foreground)] transition-colors opacity-0 group-hover:opacity-100"
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

        {/* Books */}
        <section>
          <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
            <p className="ps-eyebrow-muted">Books</p>
            {bookStats.length > 0 && (
              <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
                {bookStats.length}
              </span>
            )}
          </div>

          {bookStats.length === 0 ? (
            <p className="themed-muted py-8" style={{ fontSize: "0.9375rem" }}>No books yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b themed-border">
                    <th className="pb-3 pr-4 text-left themed-muted" style={thStyle}>Title</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>Ch.</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>Total</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>Unique</th>
                    <th className="pb-3 pr-4 text-right themed-muted whitespace-nowrap" style={thStyle}>30 days</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedBookStats.map((row, i) => (
                    <tr key={row.bookId} className="border-b themed-border last:border-0 group">
                      <td className="py-3.5 pr-4">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span
                            className="shrink-0 tabular-nums select-none"
                            style={{ fontSize: "0.5625rem", fontFamily: "ui-monospace, monospace", color: "var(--muted-foreground)", letterSpacing: "0.05em" }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Link
                            href={`/${publisherSlug}/books/${row.slug}`}
                            className="ps-list-link truncate"
                            style={{ minWidth: 0 }}
                          >
                            {row.title}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-muted" style={{ fontSize: "0.875rem" }}>
                        {row.chapterCount.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-muted" style={{ fontSize: "0.875rem" }}>
                        {row.totalViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-muted" style={{ fontSize: "0.875rem" }}>
                        {row.uniqueViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums themed-heading font-medium" style={{ fontSize: "1rem" }}>
                        {row.last30dViews.toLocaleString()}
                      </td>
                      <td className="py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/${publisherSlug}/analytics/books/${row.slug}`}
                          className="themed-nav-link hover:text-[var(--foreground)] transition-colors opacity-0 group-hover:opacity-100"
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

      </div>
    </main>
  );
}
