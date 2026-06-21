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
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">

      {/* Header */}
      <div className="mb-10">
        <p className="ps-eyebrow mb-3">Principia Synthesia</p>
        <h1
          className="ps-display themed-heading mb-8"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
        >
          Categories
        </h1>
      </div>

      {results.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ps-eyebrow mb-3">Empty</p>
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
            No categories yet.
          </p>
        </div>
      ) : (
        <div>
          {/* Section header */}
          <div className="flex items-baseline justify-between pb-3 border-b themed-border">
            <p className="ps-eyebrow-muted">All categories</p>
            <span
              className="themed-muted"
              style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
            >
              {results.length}
            </span>
          </div>

          {/* Category rows */}
          {results.map((c) => (
            <div
              key={c.id}
              className="flex items-baseline justify-between hover:bg-[var(--surface)] transition-colors"
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "0.875rem 0.5rem",
              }}
            >
              <Link
                href={`/category/${c.slug}`}
                className="ps-list-link flex-1 min-w-0"
              >
                {c.name}
              </Link>
              <span
                className="themed-muted tabular-nums shrink-0 ml-6"
                style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
              >
                {c.articleCount}{" "}
                {c.articleCount === 1 ? "article" : "articles"}
              </span>
            </div>
          ))}
        </div>
      )}

    </main>
  );
}
