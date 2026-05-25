import Link from "next/link";
import { db } from "@/db";
import { articles, articleViews, publishers, resourceVisibility } from "@/db/schema";
import { desc, eq, count, min, sql, and, isNull, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  // Top 5 public articles by view count in the last 30 days
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
    <main>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-12 sm:py-20 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight themed-heading mb-4 sm:mb-6">
          Principia Synthesia
        </h1>
        <p className="text-base sm:text-xl themed-muted mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
          A collaborative publishing platform for mathematical and scientific knowledge.
          Write articles, build curricula, and share interactive animations.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          {session ? (
            <Link href={`/${session.userSlug}`} className="themed-btn-primary px-6 py-3 text-base">
              My profile
            </Link>
          ) : (
            <>
              <Link href="/signup" className="themed-btn-primary px-6 py-3 text-base">
                Get started
              </Link>
              <Link href="/login" className="themed-btn-ghost px-6 py-3 text-base">
                Sign in
              </Link>
            </>
          )}
        </div>

        {/* Feature bullets */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="themed-surface rounded-lg p-6">
            <h3 className="font-semibold themed-heading mb-2">Publisher profiles</h3>
            <p className="text-sm themed-muted">
              Every user and organization gets a permanent publisher slug and a profile page to showcase their work.
            </p>
          </div>
          <div className="themed-surface rounded-lg p-6">
            <h3 className="font-semibold themed-heading mb-2">Rich content types</h3>
            <p className="text-sm themed-muted">
              Write MDX articles with LaTeX math, build structured books, and create interactive canvas animations.
            </p>
          </div>
          <div className="themed-surface rounded-lg p-6">
            <h3 className="font-semibold themed-heading mb-2">Access control</h3>
            <p className="text-sm themed-muted">
              Control who can see your content: public, organization-members only, or specific users.
            </p>
          </div>
        </div>
      </section>

      {/* Top articles this month */}
      {topArticles.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pb-12 sm:pb-20">
          <h2 className="text-2xl font-semibold themed-heading mb-6">Top articles this month</h2>
          <ul className="space-y-4">
            {topArticles.map((a) => {
              const pubSlug = a.publisherSlug ?? "unknown";
              return (
                <li key={a.id} className="border-b themed-border pb-4">
                  <Link
                    href={`/${pubSlug}/articles/${a.slug}`}
                    className="text-lg font-medium themed-link"
                  >
                    {a.title}
                  </Link>
                  {a.summary && <p className="text-sm themed-muted mt-1 line-clamp-2">{a.summary}</p>}
                  <p className="text-xs themed-muted mt-1">by @{pubSlug}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
