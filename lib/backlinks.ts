import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { articles, books, publishers, resourceVisibility } from "@/db/schema";
import { and, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { wikilinkRe } from "@/lib/wikilink-syntax";
import { BACKLINKS_TAG } from "@/lib/backlinks-tag";

/** The page whose incoming links we want. */
export interface BacklinkTarget {
  /** Excluded from its own list (a page may link to itself). */
  articleId: number;
  publisherSlug: string;
  /** The article's own slug. */
  slug: string;
  /** Set for a book-internal section: the book it lives in. */
  bookSlug?: string | null;
}

/** A public page that links to the target. */
export interface Backlink {
  title: string;
  href: string;
  /** The book a linking section belongs to, for context. */
  bookTitle: string | null;
}


/**
 * Whether one wikilink in `content` points at `target`. A standalone article is
 * reached by `[[pub:articles:slug]]`; a book section by the book-qualified
 * `[[pub:books:book:slug]]`, or by the bare articles form, which resolves when
 * only one book has that slug — counted, since that is what the reader got.
 * Pure; exported for tests.
 */
export function linksTo(content: string, target: BacklinkTarget): boolean {
  for (const m of content.matchAll(wikilinkRe())) {
    const [, publisher, type, slug, section] = m;
    if (publisher !== target.publisherSlug) continue;
    if (type === "articles" && !section && slug === target.slug) return true;
    if (target.bookSlug && type === "books" && slug === target.bookSlug && section === target.slug) return true;
  }
  return false;
}

/** LIKE-escape (slugs are [a-z0-9-], but never trust that in SQL). */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Public, published pages that wikilink to `target`, for the "Linked from"
 * list under an article or book section.
 *
 * No link table: a LIKE prefilter on article content finds candidates, and
 * `linksTo` confirms each with the real wikilink grammar (so `x` never matches
 * `x-2`). Only pages anyone may read are returned — the same public/published
 * rules as search — which makes the result identical for every visitor and
 * safe to cache globally: five minutes, or until an article is saved
 * (`revalidateTag(BACKLINKS_TAG)`).
 */
export const getBacklinks = unstable_cache(
  async (target: BacklinkTarget): Promise<Backlink[]> => {
    const prefix = `[[${likeEscape(target.publisherSlug)}:`;
    const patterns: SQL[] = [
      sql`${articles.content} LIKE ${`%${prefix}articles:${likeEscape(target.slug)}%`}`,
    ];
    if (target.bookSlug) {
      patterns.push(
        sql`${articles.content} LIKE ${`%${prefix}books:${likeEscape(target.bookSlug)}:${likeEscape(target.slug)}%`}`
      );
    }

    const parent = alias(books, "parent_book");
    const bookVis = alias(resourceVisibility, "book_vis");
    const rows = await db
      .select({
        title: articles.title,
        slug: articles.slug,
        content: articles.content,
        isInternal: articles.isInternal,
        publisherSlug: publishers.slug,
        bookSlug: parent.slug,
        bookTitle: parent.title,
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
      .leftJoin(parent, eq(articles.parentBookId, parent.id))
      .leftJoin(
        bookVis,
        and(
          eq(bookVis.resourceType, "book"),
          eq(bookVis.ownerType, parent.ownerType),
          eq(bookVis.ownerId, parent.ownerId),
          eq(bookVis.resourceKey, parent.slug)
        )
      )
      .innerJoin(
        publishers,
        or(
          and(eq(articles.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, articles.ownerId)),
          and(eq(articles.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, articles.ownerId))
        )
      )
      .where(
        and(
          isNull(articles.deletedAt),
          sql`${articles.metadata}->>'status' = 'published'`,
          or(...patterns),
          ne(articles.id, target.articleId),
          or(
            and(
              eq(articles.isInternal, false),
              or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
            ),
            and(
              eq(articles.isInternal, true),
              isNull(parent.deletedAt),
              sql`${parent.metadata}->>'status' = 'published'`,
              or(isNull(bookVis.visibility), eq(bookVis.visibility, "public"))
            )
          )
        )
      )
      .limit(100);

    return rows
      .filter((r) => r.content && linksTo(r.content, target))
      .map((r) => ({
        title: r.title,
        href:
          r.isInternal && r.bookSlug
            ? `/${r.publisherSlug}/books/${r.bookSlug}/${r.slug}`
            : `/${r.publisherSlug}/articles/${r.slug}`,
        bookTitle: r.isInternal ? r.bookTitle : null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
  ["backlinks-v1"],
  { revalidate: 300, tags: [BACKLINKS_TAG] }
);
