import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { ilike, or, and, eq, inArray, sql } from "drizzle-orm";
import ArticleCard from "@/components/ArticleCard";
import { getSession } from "@/lib/auth";
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string }>;
}) {
  const { q, tags } = await searchParams;
  const query = q || "";
  const session = await getSession();

  // Parse and normalize tag list
  const tagList = (tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [
    eq(articles.isInternal, false) as any,
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

  if (tagList.length > 0) {
    conditions.push(
      sql`${articles.metadata}->'tags' @> ${JSON.stringify(tagList)}::jsonb` as any
    );
  }

  if (!session?.isAdmin) {
    conditions.push(
      sql`${articles.metadata}->>'status' = 'published'` as any
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
          updatedAt: articles.updatedAt,
        })
        .from(articles)
        .where(and(...conditions))
    : [];

  // Filter by article visibility
  const visibleArticleSlugs = await getVisibleArticleSlugs(session, rawResults.map((a) => a.slug));
  const filtered =
    visibleArticleSlugs === "all"
      ? rawResults
      : rawResults.filter((a) => visibleArticleSlugs.has(a.slug));

  // Filter out articles belonging only to private books
  let finalResults = filtered;
  if (filtered.length > 0) {
    const articleBookSlugs = await db
      .select({ articleSlug: articles.slug, bookSlug: curriculumEntries.bookSlug })
      .from(articles)
      .innerJoin(curriculumEntries, eq(curriculumEntries.articleId, articles.id))
      .where(inArray(articles.slug, filtered.map((a) => a.slug)));

    const allBookSlugs = [...new Set(articleBookSlugs.map((r) => r.bookSlug))];
    const visibleBooks = await getVisibleBookSlugs(session, allBookSlugs);

    const articleToBooks = new Map<string, string[]>();
    for (const r of articleBookSlugs) {
      const list = articleToBooks.get(r.articleSlug) ?? [];
      list.push(r.bookSlug);
      articleToBooks.set(r.articleSlug, list);
    }

    finalResults = filtered.filter((a) => {
      const books = articleToBooks.get(a.slug);
      if (!books || books.length === 0) return true; // standalone article — already gated above
      if (visibleBooks === "all") return true;
      return books.some((b) => visibleBooks.has(b));
    });
  }

  const results = finalResults;
  const hasActiveFilter = !!query || tagList.length > 0;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-6">
        Search
      </h1>
      <form method="GET" action="/search" className="mb-8 space-y-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search articles by title, content, or summary..."
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
        <input
          name="tags"
          defaultValue={tags || ""}
          placeholder="Filter by tags: physics, mechanics"
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
      </form>

      {hasActiveFilter && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-6">
          {results.length} {results.length === 1 ? "result" : "results"}
          {query && <> for &ldquo;{query}&rdquo;</>}
          {tagList.length > 0 && (
            <> tagged {tagList.map((t) => <code key={t} className="ml-1">#{t}</code>)}</>
          )}
        </p>
      )}

      {results.length === 0 && hasActiveFilter && (
        <p className="text-zinc-400 dark:text-zinc-500">No results found.</p>
      )}

      <ul className="space-y-6">
        {results.map((a) => (
          <li key={a.id}>
            <ArticleCard {...a} />
          </li>
        ))}
      </ul>
    </main>
  );
}
