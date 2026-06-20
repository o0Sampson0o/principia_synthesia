import Link from "next/link";
import { db } from "@/db";
import { articles, articleViews, publishers, resourceVisibility } from "@/db/schema";
import { desc, eq, count, min, sql, and, isNull, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  const topArticles = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      viewCount: count(articleViews.id).as("view_count"),
      publisherSlug: min(publishers.slug),
    })
    .from(articles)
    .innerJoin(articleViews, eq(articleViews.articleId, articles.id))
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "article"),
        eq(resourceVisibility.ownerType, articles.ownerType),
        eq(resourceVisibility.ownerId, articles.ownerId),
        eq(resourceVisibility.resourceKey, articles.slug)
      )
    )
    .leftJoin(
      publishers,
      or(
        and(eq(articles.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, articles.ownerId)),
        and(eq(articles.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, articles.ownerId))
      )
    )
    .where(
      and(
        eq(articles.isInternal, false),
        sql`${articles.metadata}->>'status' = 'published'`,
        sql`${articleViews.viewedAt} > NOW() - INTERVAL '30 days'`,
        or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public")),
        isNull(articles.deletedAt)
      )
    )
    .groupBy(articles.id, articles.slug, articles.title, articles.summary)
    .orderBy(desc(count(articleViews.id)))
    .limit(5);

  return (
    <main className="flex-1">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <h1
          className="max-w-2xl mb-6"
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: "var(--foreground)",
          }}
        >
          Your personal library<br />
          of{" "}
          <span style={{ color: "var(--accent)" }}>scientific knowledge</span>
        </h1>

        <p
          className="max-w-md mb-9"
          style={{ fontSize: "1.0625rem", lineHeight: 1.75, color: "var(--muted-foreground)" }}
        >
          Write, publish, and organise mathematical and scientific articles.
          Build curricula, annotate ideas, and share your thinking with the world.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {session ? (
            <Link
              href={`/${session.userSlug}`}
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.9375rem", paddingTop: "0.625rem", paddingBottom: "0.625rem", paddingLeft: "1.375rem", paddingRight: "1.375rem" }}
            >
              Go to my profile
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="themed-btn-accent rounded-lg"
                style={{ fontSize: "0.9375rem", paddingTop: "0.625rem", paddingBottom: "0.625rem", paddingLeft: "1.375rem", paddingRight: "1.375rem" }}
              >
                Start writing
              </Link>
              <Link
                href="/login"
                className="themed-btn-outline"
                style={{ fontSize: "0.9375rem", paddingTop: "0.625rem", paddingBottom: "0.625rem", paddingLeft: "1.375rem", paddingRight: "1.375rem" }}
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Feature cards ────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <hr className="themed-hr mb-14" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <div className="themed-feature-card">
            <div className="themed-icon-wrap mb-5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h3 className="themed-heading font-semibold mb-2" style={{ fontSize: "0.9375rem", letterSpacing: "-0.025em" }}>
              Publisher profiles
            </h3>
            <p className="themed-muted leading-relaxed" style={{ fontSize: "0.8125rem" }}>
              Users and organisations each get a permanent publisher slug and a dedicated profile to showcase their work.
            </p>
          </div>

          <div className="themed-feature-card">
            <div className="themed-icon-wrap mb-5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3 className="themed-heading font-semibold mb-2" style={{ fontSize: "0.9375rem", letterSpacing: "-0.025em" }}>
              Rich content types
            </h3>
            <p className="themed-muted leading-relaxed" style={{ fontSize: "0.8125rem" }}>
              MDX articles with LaTeX math, structured books, interactive canvas animations, and full revision history.
            </p>
          </div>

          <div className="themed-feature-card">
            <div className="themed-icon-wrap mb-5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="themed-heading font-semibold mb-2" style={{ fontSize: "0.9375rem", letterSpacing: "-0.025em" }}>
              Access control
            </h3>
            <p className="themed-muted leading-relaxed" style={{ fontSize: "0.8125rem" }}>
              Make content public, restrict it to organisation members, or share with specific invited users.
            </p>
          </div>

        </div>
      </section>

      {/* ── Top articles ─────────────────────────────────────────── */}
      {topArticles.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pb-24">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <p className="themed-section-label mb-1.5">Trending</p>
              <h2
                className="themed-heading font-semibold"
                style={{ fontSize: "1.25rem", letterSpacing: "-0.03em" }}
              >
                Top articles this month
              </h2>
            </div>
            <Link
              href="/search"
              className="themed-nav-link flex items-center gap-1.5 hover:opacity-70 transition-opacity"
              style={{ fontSize: "0.8125rem" }}
            >
              All articles
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="themed-card overflow-hidden">
            {topArticles.map((a, i) => {
              const pubSlug = a.publisherSlug ?? "unknown";
              return (
                <div
                  key={a.id}
                  className="flex gap-4 items-start px-5 py-4 border-b themed-border last:border-b-0 themed-row-hover transition-colors"
                >
                  <span
                    className="tabular-nums font-semibold shrink-0 mt-0.5 w-5 text-right"
                    style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${pubSlug}/articles/${a.slug}`}
                      className="article-title-serif block mb-1.5"
                      style={{ fontSize: "1rem" }}
                    >
                      {a.title}
                    </Link>
                    {a.summary && (
                      <p className="themed-muted line-clamp-2 mb-2" style={{ fontSize: "0.8125rem", lineHeight: "1.6" }}>
                        {a.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="themed-muted" style={{ fontSize: "0.75rem" }}>@{pubSlug}</span>
                      <span className="themed-muted" style={{ fontSize: "0.75rem" }}>·</span>
                      <span className="stat-chip" style={{ fontSize: "0.75rem" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                        {a.viewCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </main>
  );
}
