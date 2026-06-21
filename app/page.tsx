import Link from "next/link";
import { db } from "@/db";
import { articles, articleViews, publishers, resourceVisibility, books } from "@/db/schema";
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
      isInternal: articles.isInternal,
      viewCount: count(articleViews.id).as("view_count"),
      publisherSlug: min(publishers.slug),
      parentBookSlug: min(books.slug),
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
    .leftJoin(books, eq(books.id, articles.parentBookId))
    .where(
      and(
        sql`${articles.metadata}->>'status' = 'published'`,
        sql`${articleViews.viewedAt} > NOW() - INTERVAL '30 days'`,
        or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public")),
        isNull(articles.deletedAt)
      )
    )
    .groupBy(articles.id, articles.slug, articles.title, articles.summary, articles.isInternal)
    .orderBy(desc(count(articleViews.id)))
    .limit(5);

  const hasArticles = topArticles.length > 0;

  return (
    <main className="flex-1">

      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto px-5">

          {/* Platform name — the masthead itself */}
          <div
            className="text-center py-7 sm:py-9"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <p
              className="ps-hero themed-heading"
              style={{ fontSize: "clamp(2.25rem, 6.5vw, 5.25rem)", letterSpacing: "-0.05em" }}
            >
              Principia Synthesia
            </p>
          </div>

          {/* Masthead meta row */}
          <div
            className="flex items-center justify-between py-2.5"
            style={{
              fontSize: "0.5625rem",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
            }}
          >
            <span className="hidden sm:block">A collaborative platform for mathematical and scientific knowledge</span>
            <span className="sm:hidden">Principia Synthesia</span>
            <span>Vol. I</span>
          </div>

        </div>
      </div>

      {/* ── Hero split ───────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-5">
        <div
          className={`grid grid-cols-1 ${hasArticles ? "lg:grid-cols-[3fr_2fr]" : ""}`}
          style={{ borderBottom: "1px solid var(--border)" }}
        >

          {/* Left: tagline + CTA */}
          <div
            className={`py-14 sm:py-20 ${hasArticles ? "lg:pr-16 lg:border-r themed-border" : ""}`}
          >
            <p className="ps-eyebrow mb-6">The open scholarly record</p>
            <p
              className="themed-heading mb-6"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(1.875rem, 4vw, 3rem)",
                fontWeight: 500,
                letterSpacing: "-0.035em",
                lineHeight: 1.1,
              }}
            >
              Publish what you know.<br />
              Exactly as you know it.
            </p>
            <p
              className="themed-muted mb-10"
              style={{ fontSize: "1rem", lineHeight: 1.8, maxWidth: "30rem" }}
            >
              Write articles with LaTeX math, build structured books, and create
              interactive scientific objects — all in one permanent, citable home.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {session ? (
                <Link
                  href={`/${session.userSlug}`}
                  className="themed-btn-accent rounded-lg"
                  style={{ fontSize: "0.9375rem", padding: "0.65rem 1.5rem" }}
                >
                  Go to my profile
                </Link>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="themed-btn-accent rounded-lg"
                    style={{ fontSize: "0.9375rem", padding: "0.65rem 1.5rem" }}
                  >
                    Start writing
                  </Link>
                  <Link
                    href="/login"
                    className="themed-btn-outline"
                    style={{ fontSize: "0.9375rem", padding: "0.6rem 1.375rem" }}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Right: trending articles — only shown when data exists */}
          {hasArticles && (
            <div className="py-14 sm:py-20 lg:pl-12 border-t themed-border lg:border-t-0">
              <div className="flex items-baseline justify-between mb-5">
                <p className="ps-eyebrow-muted">Trending this month</p>
                <Link
                  href="/search"
                  className="themed-nav-link hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
                  style={{ fontSize: "0.75rem" }}
                >
                  All
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14m-7-7 7 7-7 7" />
                  </svg>
                </Link>
              </div>

              <div>
                {topArticles.map((a, i) => {
                  const pubSlug = a.publisherSlug ?? "unknown";
                  const articleUrl = a.isInternal && a.parentBookSlug
                    ? `/${pubSlug}/books/${a.parentBookSlug}/${a.slug}`
                    : `/${pubSlug}/articles/${a.slug}`;
                  return (
                    <div
                      key={a.id}
                      className="group flex gap-4 py-4 border-b themed-border last:border-b-0"
                    >
                      <span
                        className="tabular-nums shrink-0 mt-1 select-none"
                        style={{
                          fontSize: "0.5625rem",
                          fontFamily: "ui-monospace, monospace",
                          color: "var(--muted-foreground)",
                          letterSpacing: "0.05em",
                          lineHeight: 1.6,
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={articleUrl}
                          className="article-title-serif block mb-1.5 group-hover:text-[var(--accent)] transition-colors"
                          style={{ fontSize: "0.9375rem", lineHeight: 1.35 }}
                        >
                          {a.title}
                        </Link>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="themed-muted"
                            style={{ fontSize: "0.6875rem" }}
                          >
                            @{pubSlug}
                          </span>
                          <span className="themed-muted" style={{ fontSize: "0.5625rem" }}>·</span>
                          <span
                            className="themed-muted flex items-center gap-1"
                            style={{ fontSize: "0.6875rem" }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            {a.viewCount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Feature strip ────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-5 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x themed-border">
          {[
            {
              n: "01",
              title: "Publisher profiles",
              body: "Users and organisations each get a permanent publisher slug and a dedicated profile to showcase their work.",
            },
            {
              n: "02",
              title: "Rich content types",
              body: "MDX articles with LaTeX math, structured books, interactive canvas animations, and full revision history.",
            },
            {
              n: "03",
              title: "Access control",
              body: "Make content public, restrict it to organisation members, or share with specific invited users.",
            },
          ].map(({ n, title, body }) => (
            <div key={n} className="py-10 sm:px-10 first:sm:pl-0 last:sm:pr-0">
              <p
                className="themed-muted mb-5 tabular-nums"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {n}
              </p>
              <h3
                className="themed-heading mb-3"
                style={{ fontSize: "1.0625rem", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.3 }}
              >
                {title}
              </h3>
              <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>

    </main>
  );
}
