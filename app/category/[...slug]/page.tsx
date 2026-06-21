import { db } from "@/db";
import { categories, articleCategories, articles, publishers, resourceVisibility, bookCategories, books } from "@/db/schema";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);

  if (!category) notFound();

  const session = await getSession();

  const articleConditions = [
    eq(articleCategories.categoryId, category.id),
    eq(articles.isInternal, false),
    isNull(articles.deletedAt),
  ];
  if (!session?.isRootAdmin) {
    articleConditions.push(sql`${articles.metadata}->>'status' = 'published'` as any);
    articleConditions.push(or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public")) as any);
  }

  const articleResults = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      summary: articles.summary,
      publisherSlug: publishers.slug,
    })
    .from(articles)
    .innerJoin(articleCategories, eq(articles.id, articleCategories.articleId))
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "article"),
        eq(resourceVisibility.ownerType, articles.ownerType),
        eq(resourceVisibility.ownerId, articles.ownerId),
        eq(resourceVisibility.resourceKey, articles.slug)
      )
    )
    .leftJoin(
      publishers,
      or(
        and(eq(articles.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, articles.ownerId)),
        and(eq(articles.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, articles.ownerId))
      )
    )
    .where(and(...articleConditions));

  const bookConditions = [
    eq(bookCategories.categoryId, category.id),
  ];
  if (!session?.isRootAdmin) {
    bookConditions.push(or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public")) as any);
  }

  const bookResults = await db
    .select({
      id: books.id,
      title: books.title,
      slug: books.slug,
      summary: books.summary,
      publisherSlug: publishers.slug,
    })
    .from(books)
    .innerJoin(bookCategories, eq(books.id, bookCategories.bookId))
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "book"),
        eq(resourceVisibility.ownerType, books.ownerType),
        eq(resourceVisibility.ownerId, books.ownerId),
        eq(resourceVisibility.resourceKey, books.slug)
      )
    )
    .leftJoin(
      publishers,
      or(
        and(eq(books.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, books.ownerId)),
        and(eq(books.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, books.ownerId))
      )
    )
    .where(and(...bookConditions));

  const totalResults = articleResults.length + bookResults.length;

  return (
    <main className="flex-1">

      {/* ── Framed header ───────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5">

          {/* Breadcrumb bar */}
          <div
            className="flex items-center justify-between py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <Link
              href="/category"
              className="ps-eyebrow inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5m7-7-7 7 7 7" />
              </svg>
              Categories
            </Link>
            {totalResults > 0 && (
              <span
                className="themed-muted"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {totalResults} {totalResults === 1 ? "result" : "results"}
              </span>
            )}
          </div>

          {/* Category title */}
          <div className="py-8 sm:py-11">
            <h1
              className="ps-display themed-heading"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
            >
              {category.name}
            </h1>
          </div>

        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-10 sm:py-12">

        {totalResults === 0 ? (
          <div className="py-24 text-center">
            <p className="ps-eyebrow mb-3">Empty</p>
            <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
              No content in this category yet.
            </p>
          </div>
        ) : (
          <div className="space-y-12">

            {/* Articles */}
            {articleResults.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-2">
                  <p className="ps-eyebrow-muted">Articles</p>
                  <span
                    className="themed-muted"
                    style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                  >
                    {articleResults.length}
                  </span>
                </div>

                {articleResults.map((a) => (
                  <div
                    key={`article-${a.id}`}
                    className="group hover:bg-[var(--surface)] transition-colors"
                    style={{ borderBottom: "1px solid var(--border)", padding: "1.125rem 0.5rem" }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/${a.publisherSlug ?? "unknown"}/articles/${a.slug}`}
                          className="article-title-serif block mb-1.5 hover:text-[var(--accent)] transition-colors"
                          style={{ fontSize: "0.9375rem", lineHeight: 1.35 }}
                        >
                          {a.title}
                        </Link>
                        {a.publisherSlug && (
                          <p
                            className="themed-muted mb-2"
                            style={{
                              fontSize: "0.5625rem",
                              fontFamily: "ui-monospace, monospace",
                              letterSpacing: "0.07em",
                              textTransform: "uppercase",
                            }}
                          >
                            @{a.publisherSlug}
                          </p>
                        )}
                        {a.summary && (
                          <p
                            className="themed-muted"
                            style={{
                              fontSize: "0.8125rem",
                              lineHeight: 1.65,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical" as const,
                              overflow: "hidden",
                            }}
                          >
                            {a.summary}
                          </p>
                        )}
                      </div>
                      <span
                        className="themed-muted opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1"
                        aria-hidden="true"
                        style={{ fontSize: "0.875rem" }}
                      >
                        →
                      </span>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Books */}
            {bookResults.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-2">
                  <p className="ps-eyebrow-muted">Books</p>
                  <span
                    className="themed-muted"
                    style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                  >
                    {bookResults.length}
                  </span>
                </div>

                {bookResults.map((b) => (
                  <div
                    key={`book-${b.id}`}
                    className="group hover:bg-[var(--surface)] transition-colors"
                    style={{ borderBottom: "1px solid var(--border)", padding: "1.125rem 0.5rem" }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/${b.publisherSlug ?? "unknown"}/books/${b.slug}`}
                          className="article-title-serif block mb-1.5 hover:text-[var(--accent)] transition-colors"
                          style={{ fontSize: "0.9375rem", lineHeight: 1.35 }}
                        >
                          {b.title}
                        </Link>
                        {b.publisherSlug && (
                          <p
                            className="themed-muted mb-2"
                            style={{
                              fontSize: "0.5625rem",
                              fontFamily: "ui-monospace, monospace",
                              letterSpacing: "0.07em",
                              textTransform: "uppercase",
                            }}
                          >
                            @{b.publisherSlug}
                          </p>
                        )}
                        {b.summary && (
                          <p
                            className="themed-muted"
                            style={{
                              fontSize: "0.8125rem",
                              lineHeight: 1.65,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical" as const,
                              overflow: "hidden",
                            }}
                          >
                            {b.summary}
                          </p>
                        )}
                      </div>
                      <span
                        className="themed-muted opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1"
                        aria-hidden="true"
                        style={{ fontSize: "0.875rem" }}
                      >
                        →
                      </span>
                    </div>
                  </div>
                ))}
              </section>
            )}

          </div>
        )}

      </div>
    </main>
  );
}
