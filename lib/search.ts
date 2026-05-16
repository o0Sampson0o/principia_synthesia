"use server";

import { db } from "@/db";
import { articles, books, objects, publishers, users, organizations, resourceVisibility } from "@/db/schema";
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

async function getPublisherSlug(ownerType: string, ownerId: number): Promise<string> {
  if (ownerType === "user") {
    const [row] = await db
      .select({ publisherSlug: users.publisherSlug })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);
    return row?.publisherSlug ?? "unknown";
  } else {
    const [row] = await db
      .select({ publisherSlug: organizations.publisherSlug })
      .from(organizations)
      .where(eq(organizations.id, ownerId))
      .limit(1);
    return row?.publisherSlug ?? "unknown";
  }
}

/**
 * Searches articles, books, and objects by title/name. Returns up to 8 results
 * per category. Internal articles are excluded. Private resources are excluded
 * for non-admin sessions (simplified: checks resourceVisibility for public only).
 */
export async function searchAll(query: string): Promise<SearchAllResult> {
  const session = await getSession();
  const q = `%${query}%`;

  const [articleRows, bookRows, objectRows] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        ownerType: articles.ownerType,
        ownerId: articles.ownerId,
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
      .where(
        and(
          eq(articles.isInternal, false),
          ilike(articles.title, q),
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
        ownerType: books.ownerType,
        ownerId: books.ownerId,
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
        ownerType: objects.ownerType,
        ownerId: objects.ownerId,
      })
      .from(objects)
      .where(ilike(objects.name, q))
      .limit(8),
  ]);

  // Resolve publisher slugs
  const articleResults: SearchArticleResult[] = await Promise.all(
    articleRows.map(async (a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      publisherSlug: await getPublisherSlug(a.ownerType, a.ownerId),
    }))
  );

  const bookResults: SearchBookResult[] = await Promise.all(
    bookRows.map(async (b) => ({
      id: b.id,
      title: b.title,
      slug: b.slug,
      publisherSlug: await getPublisherSlug(b.ownerType, b.ownerId),
    }))
  );

  const objectResults: SearchObjectResult[] = await Promise.all(
    objectRows.map(async (o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      type: o.type,
      publisherSlug: await getPublisherSlug(o.ownerType, o.ownerId),
    }))
  );

  return { articles: articleResults, books: bookResults, objects: objectResults };
}
