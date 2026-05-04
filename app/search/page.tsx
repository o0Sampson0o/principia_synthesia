import { db } from "@/db";
import { articles } from "@/db/schema";
import { ilike } from "drizzle-orm";
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
        .select()
        .from(articles)
        .where(ilike(articles.title, `%${query}%`))
    : [];

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Search</h1>
      <form method="GET" action="/search">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search articles..."
          className="w-full border rounded px-4 py-2 mb-6"
        />
      </form>
      {results.length === 0 && query && <p>No results for "{query}"</p>}
      <ul className="space-y-4">
        {results.map((a) => (
          <li key={a.id}>
            <Link
              href={`/${a.slug}`}
              className="text-blue-600 text-lg hover:underline"
            >
              {a.title}
            </Link>
            <p className="text-gray-500 text-sm">{a.summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
