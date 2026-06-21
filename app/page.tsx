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

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pt-24 pb-20 sm:pt-36 sm:pb-28">
        <p className="ps-eyebrow mb-8">Principia Synthesia</p>
        <h1
          className="ps-hero mb-8"
          style={{ fontSize: "clamp(3.25rem, 8vw, 6rem)" }}
        >
          Your personal research<br />
          library for science<br />
          <span style={{ color: "var(--accent)" }}>and mathematics.</span>
        </h1>
        <p
          className="themed-muted mb-10"
          style={{ fontSize: "1.0625rem", lineHeight: 1.75, maxWidth: "28rem" }}
        >
          Write, publish, and organise articles, books, and interactive objects.
          Share your thinking with the world.
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
      </section>

      {/* ── Feature rows ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pb-24">
        <hr className="themed-hr mb-0" />

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x themed-border">

          <div className="pt-8 pb-10 sm:pr-10">
            <p className="ps-eyebrow mb-5">01</p>
            <h3
              className="themed-heading mb-3"
              style={{ fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Publisher profiles
            </h3>
            <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
              Users and organisations each get a permanent publisher slug and a dedicated profile to showcase their work.
            </p>
          </div>

          <div className="pt-8 pb-10 sm:px-10">
            <p className="ps-eyebrow mb-5">02</p>
            <h3
              className="themed-heading mb-3"
              style={{ fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Rich content types
            </h3>
            <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
              MDX articles with LaTeX math, structured books, interactive canvas animations, and full revision history.
            </p>
          </div>

          <div className="pt-8 pb-10 sm:pl-10">
            <p className="ps-eyebrow mb-5">03</p>
            <h3
              className="themed-heading mb-3"
              style={{ fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              Access control
            </h3>
            <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
              Make content public, restrict it to organisation members, or share with specific invited users.
            </p>
          </div>

        </div>
      </section>

      {/* ── Top articles ──────────────────────────────────────────────── */}
      {topArticles.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pb-28">
          <hr className="themed-hr mb-10" />

          <div className="flex items-baseline justify-between mb-8">
            <h2
              className="themed-heading font-medium"
              style={{ fontSize: "1.125rem", letterSpacing: "-0.025em" }}
            >
              Trending this month
            </h2>
            <Link
              href="/search"
              className="themed-nav-link flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
              style={{ fontSize: "0.8125rem" }}
            >
              All articles
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14m-7-7 7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div>
            {topArticles.map((a, i) => {
              const pubSlug = a.publisherSlug ?? "unknown";
              return (
                <div
                  key={a.id}
                  className="flex gap-5 items-start py-6 border-b themed-border last:border-b-0 group"
                >
                  <span
                    className="tabular-nums font-semibold shrink-0 mt-1 w-5 text-right select-none"
                    style={{ fontSize: "0.625rem", color: "var(--muted-foreground)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${pubSlug}/articles/${a.slug}`}
                      className="article-title-serif block mb-2 group-hover:text-[var(--accent)] transition-colors"
                      style={{ fontSize: "1.0625rem" }}
                    >
                      {a.title}
                    </Link>
                    {a.summary && (
                      <p
                        className="themed-muted line-clamp-2 mb-3"
                        style={{ fontSize: "0.875rem", lineHeight: 1.65 }}
                      >
                        {a.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2.5">
                      <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
                        @{pubSlug}
                      </span>
                      <span className="themed-muted" style={{ fontSize: "0.625rem" }}>·</span>
                      <span className="themed-muted flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
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
