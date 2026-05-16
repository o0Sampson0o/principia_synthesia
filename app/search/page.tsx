import { db } from "@/db";
import { articles, publishers, users, organizations, resourceVisibility } from "@/db/schema";
import { ilike, or, and, eq, sql, isNull } from "drizzle-orm";
import ArticleCard from "@/components/ArticleCard";
import { getSession } from "@/lib/auth";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string }>;
}) {
  const { q, tags } = await searchParams;
  const query = q || "";
  const session = await getSession();

  const tagList = (tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const conditions: ReturnType<typeof eq>[] = [
    eq(articles.isInternal, false) as unknown as ReturnType<typeof eq>,
  ];

  if (query) {
    conditions.push(
      or(
        ilike(articles.title, `%${query}%`),
        ilike(articles.content, `%${query}%`),
        ilike(articles.summary, `%${query}%`)
      ) as unknown as ReturnType<typeof eq>
    );
  }

  if (tagList.length > 0) {
    conditions.push(
      sql`${articles.metadata}->'tags' @> ${JSON.stringify(tagList)}::jsonb` as unknown as ReturnType<typeof eq>
    );
  }

  if (!session?.isRootAdmin) {
    conditions.push(
      sql`${articles.metadata}->>'status' = 'published'` as unknown as ReturnType<typeof eq>
    );
  }

  // Only show public articles (or root admin sees all)
  if (!session?.isRootAdmin) {
    conditions.push(
      or(
        isNull(resourceVisibility.visibility),
        eq(resourceVisibility.visibility, "public")
      ) as unknown as ReturnType<typeof eq>
    );
  }

  const shouldRunQuery = !!query || tagList.length > 0;

  const rawResults = shouldRunQuery
    ? await db
        .select({
          id: articles.id,
          slug: articles.slug,
          title: articles.title,
          summary: articles.summary,
          ownerType: articles.ownerType,
          ownerId: articles.ownerId,
          updatedAt: articles.updatedAt,
        })
        .from(articles)
        .leftJoin(
          resourceVisibility,
          and(
            eq(resourceVisibility.resourceType, "article"),
            eq(resourceVisibility.ownerType, articles.ownerType),
            eq(resourceVisibility.ownerId, articles.ownerId),
            eq(resourceVisibility.resourceKey, articles.slug)
          )
        )
        .where(and(...conditions))
    : [];

  // Build publisher slug lookup for results
  const pubMap = new Map<string, string>();
  for (const a of rawResults) {
    const key = `${a.ownerType}:${a.ownerId}`;
    if (pubMap.has(key)) continue;
    if (a.ownerType === "user") {
      const [row] = await db
        .select({ publisherSlug: users.publisherSlug })
        .from(users)
        .where(eq(users.id, a.ownerId))
        .limit(1);
      if (row) pubMap.set(key, row.publisherSlug);
    } else {
      const [row] = await db
        .select({ publisherSlug: organizations.publisherSlug })
        .from(organizations)
        .where(eq(organizations.id, a.ownerId))
        .limit(1);
      if (row) pubMap.set(key, row.publisherSlug);
    }
  }

  const results = rawResults.map((a) => ({
    ...a,
    publisherSlug: pubMap.get(`${a.ownerType}:${a.ownerId}`) ?? "unknown",
  }));

  const hasActiveFilter = !!query || tagList.length > 0;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold themed-heading mb-6">Search</h1>
      <form method="GET" action="/search" className="mb-8 space-y-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search articles by title, content, or summary..."
          className="themed-input w-full"
        />
        <input
          name="tags"
          defaultValue={tags || ""}
          placeholder="Filter by tags: physics, mechanics"
          className="themed-input w-full"
        />
        <button type="submit" className="themed-btn-primary">
          Search
        </button>
      </form>

      {hasActiveFilter && (
        <p className="text-sm themed-muted mb-6">
          {results.length} {results.length === 1 ? "result" : "results"}
          {query && <> for &ldquo;{query}&rdquo;</>}
          {tagList.length > 0 && (
            <> tagged {tagList.map((t) => <code key={t} className="ml-1">#{t}</code>)}</>
          )}
        </p>
      )}

      {results.length === 0 && hasActiveFilter && (
        <p className="themed-muted">No results found.</p>
      )}

      <ul className="space-y-6">
        {results.map((a) => (
          <li key={a.id}>
            <ArticleCard
              publisherSlug={a.publisherSlug}
              slug={a.slug}
              title={a.title}
              summary={a.summary}
              updatedAt={a.updatedAt}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
