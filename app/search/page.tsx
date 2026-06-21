import { db } from "@/db";
import { categories, articleCategories } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";
import { searchAll } from "@/lib/search";
import SearchResultItem from "@/components/SearchResultItem";
import TagFilterBar from "@/components/TagFilterBar";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; tags?: string }>;
}) {
  const { q, category, tags } = await searchParams;
  const query = q?.trim() ?? "";
  const categorySlug = category?.trim() ?? "";
  const tagList = (tags ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const hasActiveFilter = !!query || !!categorySlug || tagList.length > 0;

  // Always fetch categories — needed for browse grid and pill row
  const allCategories = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      articleCount: count(articleCategories.articleId),
    })
    .from(categories)
    .leftJoin(articleCategories, eq(categories.id, articleCategories.categoryId))
    .groupBy(categories.id, categories.slug, categories.name)
    .orderBy(categories.name);

  const currentCategory = categorySlug
    ? (allCategories.find((c) => c.slug === categorySlug) ?? null)
    : null;

  // Fetch results only when there's an active filter
  let results: Awaited<ReturnType<typeof searchAll>> = { articles: [], books: [], objects: [] };
  if (hasActiveFilter) {
    results = await searchAll(query, {
      categorySlug: categorySlug || undefined,
      tags: tagList.length ? tagList : undefined,
    });
  }

  const totalResults = results.articles.length + results.books.length + results.objects.length;

  // Status line tokens for search mode
  const statusParts: string[] = [];
  if (hasActiveFilter) statusParts.push(`${totalResults} result${totalResults !== 1 ? "s" : ""}`);
  if (query) statusParts.push(query.toUpperCase());
  if (currentCategory) statusParts.push(currentCategory.name.toUpperCase());
  for (const t of tagList) statusParts.push(`#${t.toUpperCase()}`);

  const isSearchMode = hasActiveFilter && (!!query || tagList.length > 0);
  const isCategoryMode = hasActiveFilter && !query && !tagList.length && !!categorySlug;

  return (
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5 py-10 sm:py-14">

          <p className="ps-eyebrow mb-4">
            {isSearchMode ? "Search" : "Discover"}
          </p>

          {/* Headline — three variants */}
          {!hasActiveFilter && (
            <h1 className="ps-hero themed-heading" style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)" }}>
              Search or browse.
            </h1>
          )}
          {isCategoryMode && (
            <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
              {currentCategory?.name ?? categorySlug}
            </h1>
          )}
          {isSearchMode && (
            <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
              {query ? <>&ldquo;{query}&rdquo;</> : "Results"}
            </h1>
          )}

          {/* Status line */}
          {isSearchMode && (
            <p
              className="themed-muted mt-3"
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

          {/* Search form */}
          <form method="GET" action="/search">
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            {tagList.length > 0 && <input type="hidden" name="tags" value={tagList.join(",")} />}
            <div className="ps-action-bar gap-2 mt-6">
              <input
                name="q"
                defaultValue={query}
                placeholder="Search articles, books…"
                autoFocus={!hasActiveFilter}
                className="themed-input flex-1 min-w-0"
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

          {/* Tag filter bar — active tags as removable chips + inline add input */}
          <TagFilterBar tags={tagList} query={query} categorySlug={categorySlug} />

        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-10 sm:py-12">

        {/* Browse mode — category grid */}
        {!hasActiveFilter && (
          allCategories.length === 0 ? (
            <div className="py-20 text-center">
              <p className="ps-eyebrow mb-3">Empty</p>
              <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>No tags yet.</p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-5">
                <p className="ps-eyebrow-muted">All subjects</p>
                <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
                  {allCategories.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allCategories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/search?category=${cat.slug}`}
                    className="group hover:bg-[var(--surface)] transition-colors"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      padding: "0.875rem 1rem",
                      display: "block",
                      textDecoration: "none",
                    }}
                  >
                    <p
                      className="article-title-serif themed-heading group-hover:text-[var(--accent)] transition-colors"
                      style={{ fontSize: "0.9375rem", lineHeight: 1.3, marginBottom: "0.375rem" }}
                    >
                      {cat.name}
                    </p>
                    <p
                      className="themed-muted"
                      style={{
                        fontSize: "0.5625rem",
                        fontFamily: "ui-monospace, monospace",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {cat.articleCount} {cat.articleCount === 1 ? "article" : "articles"}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )
        )}

        {/* Active filter — empty state */}
        {hasActiveFilter && totalResults === 0 && (
          <div className="py-20 text-center">
            <p className="ps-eyebrow mb-3">No results</p>
            <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
              Try a different term{categorySlug ? " or clear the category filter" : ""}.
            </p>
          </div>
        )}

        {/* Active filter — results */}
        {hasActiveFilter && totalResults > 0 && (
          <div className="space-y-12">

            {results.articles.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-0">
                  <p className="ps-eyebrow-muted">Articles</p>
                  <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
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
                <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-0">
                  <p className="ps-eyebrow-muted">Books</p>
                  <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
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
                <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-0">
                  <p className="ps-eyebrow-muted">Objects</p>
                  <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
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

      </div>
    </main>
  );
}
