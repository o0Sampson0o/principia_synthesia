import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { articles, books, curriculumEntries } from "@/db/schema";
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
    .select({ id: articles.id, title: articles.title, slug: articles.slug, isInternal: articles.isInternal })
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

  // Resolve the correct URL — internal articles live under their parent book
  let articleUrl = `/${publisherSlug}/articles/${articleRow.slug}`;
  if (articleRow.isInternal) {
    const [entry] = await db
      .select({ bookSlug: books.slug })
      .from(curriculumEntries)
      .innerJoin(books, eq(books.id, curriculumEntries.bookId))
      .where(eq(curriculumEntries.articleId, articleRow.id))
      .limit(1);
    if (entry) {
      articleUrl = `/${publisherSlug}/books/${entry.bookSlug}/${articleRow.slug}`;
    }
  }

  const [dailyViews, sourceBreakdown] = await Promise.all([
    getDailyViews(articleRow.id, 30),
    getSourceBreakdown(articleRow.id, 30),
  ]);

  const totalViews30d = dailyViews.reduce((s, d) => s + d.views, 0);

  return (
    <main className="flex-1">

      {/* ── Framed article header ────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">

          {/* Nav row */}
          <div
            className="flex items-center justify-between py-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <Link
              href={`/${publisherSlug}/analytics`}
              className="themed-nav-link hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
              style={{ fontSize: "0.8125rem" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5m7-7-7 7 7 7" />
              </svg>
              Analytics
            </Link>
            <Link
              href={articleUrl}
              className="themed-nav-link hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
              style={{ fontSize: "0.8125rem" }}
            >
              View article
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14m-7-7 7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Byline zone: title left, hero stat right */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-6 lg:gap-12 py-10 sm:py-12">

            {/* Article title */}
            <div className="min-w-0">
              <p className="ps-eyebrow mb-4">Article</p>
              <h1
                className="article-title-serif"
                style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", lineHeight: 1.2 }}
              >
                {articleRow.title}
              </h1>
            </div>

            {/* Hero stat — right column, bottom-aligned with title */}
            <div className="shrink-0 lg:text-right">
              <p
                className="themed-heading font-medium tabular-nums"
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                  letterSpacing: "-0.045em",
                  lineHeight: 1,
                }}
              >
                {totalViews30d.toLocaleString()}
              </p>
              <p
                className="themed-muted mt-2.5"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Views · Last 30 days
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12 lg:gap-16 items-start">

          {/* Daily views — wide column */}
          <section>
            <div className="flex items-baseline justify-between pb-3 mb-6 border-b themed-border">
              <p className="ps-eyebrow-muted">Daily views</p>
              <p
                className="themed-muted"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Last 30 days
              </p>
            </div>
            <div className="overflow-x-auto">
              <SparklineSvg data={dailyViews} width={640} height={160} />
            </div>
          </section>

          {/* Traffic sources — narrow column */}
          <section>
            <div className="flex items-baseline justify-between pb-3 mb-6 border-b themed-border">
              <p className="ps-eyebrow-muted">Traffic sources</p>
              <p
                className="themed-muted"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Last 30 days
              </p>
            </div>
            <SourceBarSvg data={sourceBreakdown} />
          </section>

        </div>
      </div>

    </main>
  );
}
