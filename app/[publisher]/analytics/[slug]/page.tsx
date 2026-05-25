import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { getDailyViews, getSourceBreakdown } from "@/lib/analytics-queries";
import SparklineSvg from "@/components/SparklineSvg";
import SourceBarSvg from "@/components/SourceBarSvg";

export default async function ArticleAnalyticsPage({
  params,
}: {
  params: Promise<{ publisher: string; slug: string }>;
}) {
  const { publisher: publisherSlug, slug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await getSession();
  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const canEdit = await canEditContent(session, ownerType, ownerId);
  if (!canEdit) notFound();

  const [articleRow] = await db
    .select({ id: articles.id, title: articles.title, slug: articles.slug })
    .from(articles)
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!articleRow) notFound();

  const [dailyViews, sourceBreakdown] = await Promise.all([
    getDailyViews(articleRow.id, 30),
    getSourceBreakdown(articleRow.id, 30),
  ]);

  const totalViews30d = dailyViews.reduce((s, d) => s + d.views, 0);

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
          <h1 className="text-2xl font-bold mt-1">{articleRow.title}</h1>
        </div>
        <Link
          href={`/${publisherSlug}/articles/${slug}`}
          className="themed-link text-sm"
        >
          View article &rarr;
        </Link>
      </div>

      <p className="text-sm opacity-60">
        Showing data for the last 30 days &mdash; {totalViews30d.toLocaleString()} views
      </p>

      {/* Daily views sparkline */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Daily views (last 30 days)</h2>
        <div className="themed-surface rounded-lg p-4 overflow-x-auto">
          <SparklineSvg data={dailyViews} width={560} height={140} />
        </div>
      </section>

      {/* Source breakdown bar chart */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Traffic sources (last 30 days)</h2>
        <div className="themed-surface rounded-lg p-4 overflow-x-auto">
          <SourceBarSvg data={sourceBreakdown} width={440} height={160} />
        </div>
      </section>
    </main>
  );
}
