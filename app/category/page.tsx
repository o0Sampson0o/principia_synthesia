import { db } from "@/db";
import { categories, articleCategories } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";

export default async function CategoriesIndexPage() {
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
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight themed-heading mb-2">
          Categories
        </h1>
        <p className="text-sm themed-muted">
          {results.length} {results.length === 1 ? "category" : "categories"}
        </p>
      </header>

      <hr className="themed-border mb-8" />

      {results.length === 0 ? (
        <p className="themed-muted text-sm">
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
                <span className="text-sm font-medium themed-secondary group-hover:[color:var(--foreground)] transition-colors">
                  {c.name}
                </span>
                <span className="text-xs themed-muted ml-4 shrink-0">
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
