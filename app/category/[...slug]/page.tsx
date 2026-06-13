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

  // Articles in this category
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

  // Books in this category
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
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/category" className="themed-link text-sm mb-6 inline-block">
        &larr; All categories
      </Link>

      <header className="mb-8">
        <h1 className="text-4xl font-bold themed-heading mb-2">{category.name}</h1>
        <p className="text-sm themed-muted">
          {totalResults} {totalResults === 1 ? "result" : "results"}
        </p>
      </header>

      <hr className="themed-border mb-8" />

      {totalResults === 0 ? (
        <p className="themed-muted text-sm">No items in this category yet.</p>
      ) : (
        <div className="space-y-10">
          {articleResults.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest themed-muted mb-4">Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </section>
          )}

          {bookResults.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest themed-muted mb-4">Books</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
