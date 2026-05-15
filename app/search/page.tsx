import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { ilike, or, and, eq, inArray } from "drizzle-orm";
import ArticleCard from "@/components/ArticleCard";
import { getSession } from "@/lib/auth";
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q: string }>;
}) {
  const { q } = await searchParams;
  const query = q || "";
  const session = await getSession();

  const rawResults = query
    ? await db
        .select({
          id: articles.id,
          slug: articles.slug,
          title: articles.title,
          summary: articles.summary,
          updatedAt: articles.updatedAt,
        })
        .from(articles)
        .where(
          and(
            eq(articles.isInternal, false),
            or(
              ilike(articles.title, `%${query}%`),
              ilike(articles.content, `%${query}%`),
              ilike(articles.summary, `%${query}%`)
            )
          )
        )
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

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-6">
        Search
      </h1>
      <form method="GET" action="/search" className="mb-8">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search articles by title, content, or summary..."
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
      </form>

      {query && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-6">
          {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
        </p>
      )}

      {results.length === 0 && query && (
        <p className="text-zinc-400 dark:text-zinc-500">No results for &ldquo;{query}&rdquo;</p>
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
