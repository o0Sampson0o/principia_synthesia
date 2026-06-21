import { db } from "@/db";
import { categories, articleCategories, articles, publishers, resourceVisibility, bookCategories, books } from "@/db/schema";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import SearchResultItem from "@/components/SearchResultItem";

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
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">

      {/* Breadcrumb */}
      <Link
        href="/category"
        className="ps-eyebrow inline-flex items-center gap-1.5 mb-8 hover:opacity-70 transition-opacity"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5m7-7-7 7 7 7" />
        </svg>
        Categories
      </Link>

      {/* Header */}
      <div className="mb-10">
        <h1
          className="ps-display themed-heading mb-2"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
        >
          {category.name}
        </h1>
        {totalResults > 0 && (
          <p
            className="themed-muted"
            style={{
              fontSize: "0.5625rem",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {totalResults} result{totalResults !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {totalResults === 0 ? (
        <div className="py-20 text-center">
          <p className="ps-eyebrow mb-3">Empty</p>
          <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
            No items in this category yet.
          </p>
        </div>
      ) : (
        <div className="space-y-12">

          {articleResults.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b themed-border">
                <p className="ps-eyebrow-muted">Articles</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {articleResults.length}
                </span>
              </div>
              {articleResults.map((a) => (
                <SearchResultItem
                  key={`article-${a.id}`}
                  type="article"
                  publisherSlug={a.publisherSlug ?? "unknown"}
                  slug={a.slug}
                  title={a.title}
                  description={a.summary}
                />
              ))}
            </section>
          )}

          {bookResults.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b themed-border">
                <p className="ps-eyebrow-muted">Books</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {bookResults.length}
                </span>
              </div>
              {bookResults.map((b) => (
                <SearchResultItem
                  key={`book-${b.id}`}
                  type="book"
                  publisherSlug={b.publisherSlug ?? "unknown"}
                  slug={b.slug}
                  title={b.title}
                  description={b.summary}
                />
              ))}
            </section>
          )}

        </div>
      )}

    </main>
  );
}
