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
}

export interface SearchBookResult {
  id: number;
  title: string;
  slug: string;
  publisherSlug: string;
}

export interface SearchObjectResult {
  id: number;
  name: string;
  slug: string;
  type: string;
  publisherSlug: string;
}

export interface SearchAllResult {
  articles: SearchArticleResult[];
  books: SearchBookResult[];
  objects: SearchObjectResult[];
}

/**
 * Searches articles, books, and objects by title/name. Returns up to 8 results
 * per category. Internal articles are excluded. Private resources are excluded
 * for non-admin sessions (simplified: checks resourceVisibility for public only).
 */
export async function searchAll(query: string): Promise<SearchAllResult> {
  const session = await getSession();
  const q = `%${query}%`;

  const [articleResults, bookResults, objectResults] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        publisherSlug: publishers.slug,
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
          and(eq(publishers.kind, "user"), eq(publishers.userId, articles.ownerId)),
          and(eq(publishers.kind, "org"), eq(publishers.orgId, articles.ownerId))
        )
      )
      .where(
        and(
          eq(articles.isInternal, false),
          ilike(articles.title, q),
          session?.isRootAdmin
            ? undefined
            : sql`${articles.metadata}->>'status' = 'published'`,
          session?.isRootAdmin
            ? undefined
            : or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
        )
      )
      .limit(8),

    db
      .select({
        id: books.id,
        title: books.title,
        slug: books.slug,
        publisherSlug: publishers.slug,
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
          and(eq(publishers.kind, "user"), eq(publishers.userId, books.ownerId)),
          and(eq(publishers.kind, "org"), eq(publishers.orgId, books.ownerId))
        )
      )
      .where(
        and(
          ilike(books.title, q),
          session?.isRootAdmin
            ? undefined
            : or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
        )
      )
      .limit(8),

    db
      .select({
        id: objects.id,
        name: objects.name,
        slug: objects.slug,
        type: objects.type,
        publisherSlug: publishers.slug,
      })
      .from(objects)
      .leftJoin(
        publishers,
        or(
          and(eq(publishers.kind, "user"), eq(publishers.userId, objects.ownerId)),
          and(eq(publishers.kind, "org"), eq(publishers.orgId, objects.ownerId))
        )
      )
      .where(ilike(objects.name, q))
      .limit(8),
  ]);

  return {
    articles: articleResults.map((a) => ({ ...a, publisherSlug: a.publisherSlug ?? "unknown" })),
    books: bookResults.map((b) => ({ ...b, publisherSlug: b.publisherSlug ?? "unknown" })),
    objects: objectResults.map((o) => ({ ...o, publisherSlug: o.publisherSlug ?? "unknown" })),
  };
}
