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

  // Build status line tokens
  const statusParts: string[] = [];
  if (hasActiveFilter) statusParts.push(`${totalResults} result${totalResults !== 1 ? "s" : ""}`);
  if (query) statusParts.push(query.toUpperCase());
  for (const t of tagList) statusParts.push(`#${t.toUpperCase()}`);

  return (
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">

      {/* ── Header ── */}
      <div className="mb-10">
        <p className="ps-eyebrow mb-3">Search</p>
        <h1
          className="ps-display themed-heading mb-8"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
        >
          {query ? <>&ldquo;{query}&rdquo;</> : "Find anything"}
        </h1>

        {/* Search form */}
        <form method="GET" action="/search">
          <div className="ps-action-bar gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Articles, books, objects…"
              autoFocus={!hasActiveFilter}
              className="themed-input flex-1 min-w-32"
              style={{ fontSize: "0.875rem" }}
            />
            <input
              name="tags"
              defaultValue={tags || ""}
              placeholder="Tags: physics, mechanics"
              className="themed-input sm:w-52"
              style={{ fontSize: "0.875rem" }}
            />
            <button
              type="submit"
              className="themed-btn-accent rounded-lg shrink-0"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
            >
              Search
            </button>
          </div>
        </form>

        {/* Status line */}
        {hasActiveFilter && (
          <p
            className="themed-muted mt-4"
            style={{
              fontSize: "0.5625rem",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {statusParts.join(" · ")}
          </p>
        )}
      </div>

      {/* ── Default / empty states ── */}
      {!hasActiveFilter && (
        <div className="py-20 text-center">
          <p className="ps-eyebrow mb-3">Ready</p>
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
            Enter a search term or tag above.
          </p>
        </div>
      )}

      {hasActiveFilter && totalResults === 0 && (
        <div className="py-20 text-center">
          <p className="ps-eyebrow mb-3">No results</p>
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
            Try a different search term or remove some tags.
          </p>
        </div>
      )}

      {/* ── Results ── */}
      {totalResults > 0 && (
        <div className="space-y-12">

          {results.articles.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between pb-3 mb-0 border-b themed-border">
                <p className="ps-eyebrow-muted">Articles</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {results.articles.length}
                </span>
              </div>
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
            </section>
          )}

          {results.books.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between pb-3 mb-0 border-b themed-border">
                <p className="ps-eyebrow-muted">Books</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {results.books.length}
                </span>
              </div>
              {results.books.map((b) => (
                <SearchResultItem
                  key={`book-${b.id}`}
                  type="book"
                  publisherSlug={b.publisherSlug}
                  slug={b.slug}
                  title={b.title}
                  description={b.summary}
                />
              ))}
            </section>
          )}

          {results.objects.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between pb-3 mb-0 border-b themed-border">
                <p className="ps-eyebrow-muted">Objects</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {results.objects.length}
                </span>
              </div>
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
            </section>
          )}

        </div>
      )}

    </main>
  );
}
