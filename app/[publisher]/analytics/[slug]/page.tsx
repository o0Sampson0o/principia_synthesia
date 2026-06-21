import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
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
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
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
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">

      {/* ── Header ── */}
      <div className="mb-10">
        <Link
          href={`/${publisherSlug}/analytics`}
          className="ps-eyebrow inline-flex items-center gap-1.5 mb-5"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Analytics
        </Link>

        <div className="flex items-start justify-between gap-8">
          <h1
            className="ps-display themed-heading"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}
          >
            {articleRow.title}
          </h1>
          <Link
            href={`/${publisherSlug}/articles/${slug}`}
            className="themed-nav-link hover:text-[var(--foreground)] transition-colors shrink-0 mt-1"
            style={{ fontSize: "0.8125rem" }}
          >
            View article →
          </Link>
        </div>
      </div>

      {/* ── Hero stat ── */}
      <div className="border-t border-b themed-border py-8 mb-12">
        <p
          className="themed-heading font-medium tabular-nums"
          style={{ fontSize: "clamp(3rem, 6vw, 4.5rem)", letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          {totalViews30d.toLocaleString()}
        </p>
        <p
          className="themed-muted mt-3"
          style={{ fontSize: "0.6875rem", letterSpacing: "0.07em", textTransform: "uppercase" }}
        >
          Views · Last 30 days
        </p>
      </div>

      {/* ── Charts: sparkline + sources side-by-side on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 lg:gap-16 items-start">

        {/* Daily views — gets the wider column */}
        <section>
          <div className="flex items-baseline justify-between mb-6 pb-3 border-b themed-border">
            <p className="ps-eyebrow-muted">Daily views</p>
            <p className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
              Last 30 days
            </p>
          </div>
          <SparklineSvg data={dailyViews} width={640} height={160} />
        </section>

        {/* Traffic sources — narrower column, but now has real room */}
        <section>
          <div className="flex items-baseline justify-between mb-6 pb-3 border-b themed-border">
            <p className="ps-eyebrow-muted">Traffic sources</p>
            <p className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
              Last 30 days
            </p>
          </div>
          <SourceBarSvg data={sourceBreakdown} />
        </section>

      </div>

    </main>
  );
}
