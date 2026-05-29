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

  // Summary card calculations
  const totalViews30d = stats.reduce((s, a) => s + a.last30dViews, 0);
  const totalUniqueAll = stats.reduce((s, a) => s + a.uniqueViews, 0);
  const totalAll = stats.reduce((s, a) => s + a.totalViews, 0);

  return (
    <main className="themed-container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Link href={`/${publisherSlug}`} className="themed-link text-sm">
          &larr; Back to profile
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="themed-surface rounded-lg p-4">
          <p className="text-sm opacity-60">Views (last 30 days)</p>
          <p className="text-3xl font-bold">{totalViews30d.toLocaleString()}</p>
        </div>
        <div className="themed-surface rounded-lg p-4">
          <p className="text-sm opacity-60">Unique sessions (all time)</p>
          <p className="text-3xl font-bold">{totalUniqueAll.toLocaleString()}</p>
        </div>
        <div className="themed-surface rounded-lg p-4">
          <p className="text-sm opacity-60">Total views (all time)</p>
          <p className="text-3xl font-bold">{totalAll.toLocaleString()}</p>
        </div>
      </div>

      {/* Total daily traffic sparkline */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Daily traffic (last 30 days)</h2>
        <div className="themed-surface rounded-lg p-4 overflow-x-auto">
          <SparklineSvg data={timelineData} width={560} height={140} />
        </div>
      </section>

      {/* Per-article table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Articles</h2>
        {stats.length === 0 ? (
          <p className="opacity-60">No articles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b themed-border text-left">
                  <th className="pb-2 pr-4 font-semibold">Article</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Total views</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Unique sessions</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Last 30 days</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .sort((a, b) => b.last30dViews - a.last30dViews)
                  .map((row) => (
                    <tr key={row.articleId} className="border-b themed-border">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/${publisherSlug}/articles/${row.slug}`}
                          className="themed-link hover:underline"
                        >
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.totalViews.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.uniqueViews.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.last30dViews.toLocaleString()}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/${publisherSlug}/analytics/${row.slug}`}
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

      {/* Per-book table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Books</h2>
        {bookStats.length === 0 ? (
          <p className="opacity-60">No books yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b themed-border text-left">
                  <th className="pb-2 pr-4 font-semibold">Book</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Chapters</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Total views</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Unique sessions</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Last 30 days</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {bookStats
                  .sort((a, b) => b.last30dViews - a.last30dViews)
                  .map((row) => (
                    <tr key={row.bookId} className="border-b themed-border">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/${publisherSlug}/books/${row.slug}`}
                          className="themed-link hover:underline"
                        >
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.chapterCount.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.totalViews.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.uniqueViews.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.last30dViews.toLocaleString()}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/${publisherSlug}/analytics/books/${row.slug}`}
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
