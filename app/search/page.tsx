import { db } from "@/db";
import { articles, categories, articleCategories } from "@/db/schema";
import { ilike, or, eq, count } from "drizzle-orm";
import Link from "next/link";

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
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2.5 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
      </form>

      {query && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-6">
          {results.length} {results.length === 1 ? "result" : "results"} for "{query}"
        </p>
      )}

      {results.length === 0 && query && (
        <p className="text-zinc-400 dark:text-zinc-500">No results for "{query}"</p>
      )}

      <ul className="space-y-6">
        {results.map((a) => (
          <li key={a.id}>
            <Link
              href={`/${a.slug}`}
              className="group block"
            >
              <p className="text-base font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                {a.title}
              </p>
              {a.summary && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                  {a.summary}
                </p>
              )}
              {a.updatedAt && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                  {a.updatedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
