"use server";

import { db } from "@/db";
import { articles, books, objects, publishers, resourceVisibility } from "@/db/schema";
import { ilike, and, eq, sql, or, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export interface SearchArticleResult {
  id: number;
  title: string;
  slug: string;
  publisherSlug: string;
  summary?: string | null;
}

export interface SearchBookResult {
  id: number;
  title: string;
  slug: string;
  publisherSlug: string;
  summary?: string | null;
}

export interface SearchObjectResult {
  id: number;
  name: string;
  slug: string;
  type: string;
  publisherSlug: string;
  description?: string | null;
}

export interface SearchAllResult {
  articles: SearchArticleResult[];
  books: SearchBookResult[];
  objects: SearchObjectResult[];
}

/**
 * Searches articles, books, and objects by title/name/summary/description.
 * Accepts optional categorySlug (EXISTS subquery) and tags (jsonb containment).
 * query may be empty — when combined with categorySlug this browses a category.
 * Objects are excluded when categorySlug is set (no category relationship).
 * Returns up to 20 results per type.
 */
export async function searchAll(
  query: string,
  options?: { categorySlug?: string; tags?: string[] }
): Promise<SearchAllResult> {
  const session = await getSession();
  const { categorySlug, tags: filterTags } = options ?? {};
  const q = `%${query}%`;

  // ── Article conditions ────────────────────────────────────────────────────
  const articleConditions: any[] = [
    eq(articles.isInternal, false),
    isNull(articles.deletedAt),
  ];

  if (query) {
    articleConditions.push(or(ilike(articles.title, q), ilike(articles.summary, q)));
  }
  if (categorySlug) {
    articleConditions.push(
      sql`EXISTS (
        SELECT 1 FROM article_categories
        INNER JOIN categories ON categories.id = article_categories.category_id
        WHERE article_categories.article_id = ${articles.id}
        AND categories.slug = ${categorySlug}
      )`
    );
  }
  if (filterTags?.length) {
    const slugList = sql.join(filterTags.map((t) => sql`${t}`), sql.raw(", "));
    articleConditions.push(
      sql`EXISTS (
        SELECT 1 FROM article_categories
        INNER JOIN categories ON categories.id = article_categories.category_id
        WHERE article_categories.article_id = ${articles.id}
        AND categories.slug IN (${slugList})
      )`
    );
  }
  if (!session?.isRootAdmin) {
    articleConditions.push(sql`${articles.metadata}->>'status' = 'published'`);
    articleConditions.push(
      or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
    );
  }

  // ── Book conditions ───────────────────────────────────────────────────────
  const bookConditions: any[] = [];

  if (query) {
    bookConditions.push(or(ilike(books.title, q), ilike(books.summary, q)));
  }
  if (categorySlug) {
    bookConditions.push(
      sql`EXISTS (
        SELECT 1 FROM book_categories
        INNER JOIN categories ON categories.id = book_categories.category_id
        WHERE book_categories.book_id = ${books.id}
        AND categories.slug = ${categorySlug}
      )`
    );
  }
  if (filterTags?.length) {
    const bookTagSlugs = sql.join(filterTags.map((t) => sql`${t}`), sql.raw(", "));
    bookConditions.push(
      sql`EXISTS (
        SELECT 1 FROM book_categories
        INNER JOIN categories ON categories.id = book_categories.category_id
        WHERE book_categories.book_id = ${books.id}
        AND categories.slug IN (${bookTagSlugs})
      )`
    );
  }
  if (!session?.isRootAdmin) {
    bookConditions.push(
      or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
    );
  }

  // ── Object conditions ─────────────────────────────────────────────────────
  // Objects have no category relationship — skip entirely when filtering by category.
  const objectConditions: any[] = [];
  if (!categorySlug && query) {
    objectConditions.push(or(ilike(objects.name, q), ilike(objects.description, q)));
  }

  const [articleResults, bookResults, objectResults] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        publisherSlug: publishers.slug,
        summary: articles.summary,
      })
      .from(articles)
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
      .where(and(...articleConditions))
      .limit(20),

    db
      .select({
        id: books.id,
        title: books.title,
        slug: books.slug,
        publisherSlug: publishers.slug,
        summary: books.summary,
      })
      .from(books)
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
      .where(bookConditions.length ? and(...bookConditions) : undefined)
      .limit(20),

    objectConditions.length
      ? db
          .select({
            id: objects.id,
            name: objects.name,
            slug: objects.slug,
            type: objects.type,
            publisherSlug: publishers.slug,
            description: objects.description,
          })
          .from(objects)
          .leftJoin(
            publishers,
            or(
              and(eq(objects.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, objects.ownerId)),
              and(eq(objects.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, objects.ownerId))
            )
          )
          .where(and(...objectConditions))
          .limit(20)
      : Promise.resolve([]),
  ]);

  return {
    articles: articleResults.map((a) => ({ ...a, publisherSlug: a.publisherSlug ?? "unknown" })),
    books: bookResults.map((b) => ({ ...b, publisherSlug: b.publisherSlug ?? "unknown" })),
    objects: (objectResults as any[]).map((o) => ({ ...o, publisherSlug: o.publisherSlug ?? "unknown" })),
  };
}
