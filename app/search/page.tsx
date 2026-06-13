import { db } from "@/db";
import { articles, publishers, resourceVisibility } from "@/db/schema";
import { and, eq, sql, or, isNull, ilike } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { searchAll } from "@/lib/search";
import SearchResultItem from "@/components/SearchResultItem";

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

  let results: Awaited<ReturnType<typeof searchAll>> = { articles: [], books: [], objects: [] };

  const hasActiveFilter = !!query || tagList.length > 0;

  if (hasActiveFilter) {
    if (tagList.length > 0) {
      // If we have tags, we still primarily search articles because books/objects don't have tags yet
      const conditions = [
        eq(articles.isInternal, false),
        isNull(articles.deletedAt),
        sql`${articles.metadata}->'tags' @> ${JSON.stringify(tagList)}::jsonb`
      ];

      if (query) {
        conditions.push(
          or(
            ilike(articles.title, `%${query}%`),
            ilike(articles.content, `%${query}%`),
            ilike(articles.summary, `%${query}%`)
          ) as any
        );
      }

      if (!session?.isRootAdmin) {
        conditions.push(sql`${articles.metadata}->>'status' = 'published'` as any);
        conditions.push(
          or(
            isNull(resourceVisibility.visibility),
            eq(resourceVisibility.visibility, "public")
          ) as any
        );
      }

      const articleResults = await db
        .select({
          id: articles.id,
          slug: articles.slug,
          title: articles.title,
          summary: articles.summary,
          publisherSlug: publishers.slug,
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
        .leftJoin(
          publishers,
          or(
            and(eq(articles.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, articles.ownerId)),
            and(eq(articles.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, articles.ownerId))
          )
        )
        .where(and(...conditions));

      results.articles = articleResults.map(a => ({
        ...a,
        publisherSlug: a.publisherSlug ?? "unknown"
      }));
    } else {
      results = await searchAll(query);
    }
  }

  const totalResults = results.articles.length + results.books.length + results.objects.length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl sm:text-4xl font-bold themed-heading mb-6">Search</h1>
      <form method="GET" action="/search" className="mb-8 space-y-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search articles, books, and objects..."
          className="themed-input w-full"
        />
        <input
          name="tags"
          defaultValue={tags || ""}
          placeholder="Filter articles by tags: physics, mechanics"
          className="themed-input w-full"
        />
        <button type="submit" className="themed-btn-primary">
          Search
        </button>
      </form>

      {hasActiveFilter && (
        <p className="text-sm themed-muted mb-6">
          {totalResults} {totalResults === 1 ? "result" : "results"}
          {query && <> for &ldquo;{query}&rdquo;</>}
          {tagList.length > 0 && (
            <> tagged {tagList.map((t) => <code key={t} className="ml-1">#{t}</code>)}</>
          )}
        </p>
      )}

      {totalResults === 0 && hasActiveFilter && (
        <p className="themed-muted">No results found.</p>
      )}

      <div className="space-y-10">
        {results.articles.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest themed-muted mb-4">Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.articles.map((a) => (
                <SearchResultItem
                  key={`article-${a.id}`}
                  type="article"
                  publisherSlug={a.publisherSlug}
                  slug={a.slug}
                  title={a.title}
                  description={a.summary}
                />
              ))}
            </div>
          </section>
        )}

        {results.books.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest themed-muted mb-4">Books</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.books.map((b) => (
                <SearchResultItem
                  key={`book-${b.id}`}
                  type="book"
                  publisherSlug={b.publisherSlug}
                  slug={b.slug}
                  title={b.title}
                />
              ))}
            </div>
          </section>
        )}

        {results.objects.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest themed-muted mb-4">Objects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.objects.map((o) => (
                <SearchResultItem
                  key={`object-${o.id}`}
                  type="object"
                  publisherSlug={o.publisherSlug}
                  slug={o.slug}
                  title={o.name}
                  description={o.description}
                  objectType={o.type}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
