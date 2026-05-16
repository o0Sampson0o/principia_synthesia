import Link from "next/link";
import { db } from "@/db";
import { articles, articleViews, publishers, users, organizations, resourceVisibility } from "@/db/schema";
import { desc, eq, count, sql, and, isNull, or } from "drizzle-orm";
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
      ownerType: articles.ownerType,
      ownerId: articles.ownerId,
      viewCount: count(articleViews.id).as("view_count"),
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
    .where(
      and(
        eq(articles.isInternal, false),
        sql`${articles.metadata}->>'status' = 'published'`,
        sql`${articleViews.viewedAt} > NOW() - INTERVAL '30 days'`,
        or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
      )
    )
    .groupBy(articles.id)
    .orderBy(desc(count(articleViews.id)))
    .limit(5);

  // Resolve publisher slugs for top articles
  const ownerKeys = topArticles.map((a) => ({ ownerType: a.ownerType, ownerId: a.ownerId }));
  const publisherSlugsMap = new Map<string, string>();

  for (const { ownerType, ownerId } of ownerKeys) {
    const key = `${ownerType}:${ownerId}`;
    if (publisherSlugsMap.has(key)) continue;
    if (ownerType === "user") {
      const [row] = await db
        .select({ publisherSlug: users.publisherSlug })
        .from(users)
        .where(eq(users.id, ownerId))
        .limit(1);
      if (row) publisherSlugsMap.set(key, row.publisherSlug);
    } else {
      const [row] = await db
        .select({ publisherSlug: organizations.publisherSlug })
        .from(organizations)
        .where(eq(organizations.id, ownerId))
        .limit(1);
      if (row) publisherSlugsMap.set(key, row.publisherSlug);
    }
  }

  return (
    <main>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight themed-heading mb-6">
          Principia Synthesia
        </h1>
        <p className="text-xl themed-muted mb-8 max-w-2xl mx-auto leading-relaxed">
          A collaborative publishing platform for mathematical and scientific knowledge.
          Write articles, build curricula, and share interactive animations.
        </p>
        <div className="flex items-center justify-center gap-4">
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
        <section className="max-w-3xl mx-auto px-6 pb-20">
          <h2 className="text-2xl font-semibold themed-heading mb-6">Top articles this month</h2>
          <ul className="space-y-4">
            {topArticles.map((a) => {
              const publisherSlug =
                publisherSlugsMap.get(`${a.ownerType}:${a.ownerId}`) ?? "unknown";
              return (
                <li key={a.id} className="border-b themed-border pb-4">
                  <Link
                    href={`/${publisherSlug}/articles/${a.slug}`}
                    className="text-lg font-medium themed-link"
                  >
                    {a.title}
                  </Link>
                  {a.summary && <p className="text-sm themed-muted mt-1 line-clamp-2">{a.summary}</p>}
                  <p className="text-xs themed-muted mt-1">by @{publisherSlug}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
