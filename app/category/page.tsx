import { db } from "@/db";
import { categories, articleCategories } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function CategoriesIndexPage() {
  const session = await getSession();

  const results = await db
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

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
          Categories
        </h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          {results.length} {results.length === 1 ? "category" : "categories"}
        </p>
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      {results.length === 0 ? (
        <p className="text-zinc-400 dark:text-zinc-500 text-sm">
          No categories yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {results.map((c) => (
            <li key={c.id}>
              <Link
                href={`/category/${c.slug}`}
                className="flex items-baseline justify-between group py-1"
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                  {c.name}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-4 shrink-0">
                  {c.articleCount} {c.articleCount === 1 ? "article" : "articles"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
