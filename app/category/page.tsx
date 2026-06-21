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
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="flex items-end justify-between gap-10 py-8 sm:py-11">

            <div>
              <p className="ps-eyebrow mb-3">Principia Synthesia</p>
              <h1
                className="ps-display themed-heading"
                style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
              >
                Categories
              </h1>
              <p
                className="themed-muted mt-3"
                style={{ fontSize: "0.875rem", lineHeight: 1.65 }}
              >
                Browse articles and books by subject
              </p>
            </div>

            {results.length > 0 && (
              <div className="hidden sm:block shrink-0 text-right">
                <p
                  className="themed-heading tabular-nums"
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "clamp(2rem, 4vw, 3rem)",
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  {results.length}
                </p>
                <p
                  className="themed-muted mt-2"
                  style={{
                    fontSize: "0.5625rem",
                    fontFamily: "ui-monospace, monospace",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Subjects
                </p>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-10 sm:py-12">

        {results.length === 0 ? (
          <div className="py-24 text-center">
            <p className="ps-eyebrow mb-3">Empty</p>
            <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
              No categories yet.
            </p>
          </div>
        ) : (
          <>
            {/* Section header */}
            <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-2">
              <p className="ps-eyebrow-muted">All subjects</p>
              <span
                className="themed-muted"
                style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
              >
                {results.length}
              </span>
            </div>

            {/* Category rows */}
            {results.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="group flex items-center justify-between hover:bg-[var(--surface)] transition-colors"
                style={{ borderBottom: "1px solid var(--border)", padding: "1rem 0.5rem" }}
              >
                <span
                  className="article-title-serif group-hover:text-[var(--accent)] transition-colors"
                  style={{ fontSize: "0.9375rem" }}
                >
                  {c.name}
                </span>
                <div className="flex items-center gap-3 shrink-0 ml-6">
                  <span
                    className="themed-muted tabular-nums"
                    style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                  >
                    {c.articleCount} {c.articleCount === 1 ? "article" : "articles"}
                  </span>
                  <span
                    className="themed-muted opacity-0 group-hover:opacity-50 transition-opacity"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </div>
              </Link>
            ))}
          </>
        )}

      </div>
    </main>
  );
}
