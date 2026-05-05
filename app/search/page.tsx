import { db } from "@/db";
import { articles } from "@/db/schema";
import { ilike, or } from "drizzle-orm";
import ArticleCard from "@/components/ArticleCard";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q: string }>;
}) {
  const { q } = await searchParams;
  const query = q || "";

  const results = query
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
          or(
            ilike(articles.title, `%${query}%`),
            ilike(articles.content, `%${query}%`),
            ilike(articles.summary, `%${query}%`)
          )
        )
    : [];

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
