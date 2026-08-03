import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Resolving an article by slug, now that book-internal slugs are only unique
 * within their book.
 *
 * Standalone articles are still globally unique per publisher, so a bare slug
 * always identifies at most one of them. Book-internal slugs need a book to
 * disambiguate — without one, a slug shared by sections of two different books
 * is genuinely ambiguous and callers must be told so rather than being handed
 * an arbitrary row by `.limit(1)`.
 */

export type ArticleRow = typeof articles.$inferSelect;

export type ArticleLookup =
  | { kind: "found"; article: ArticleRow }
  | { kind: "not-found" }
  /** The slug matches sections of more than one book and no book was given. */
  | { kind: "ambiguous"; matches: ArticleRow[] };

interface Params {
  ownerType: "user" | "org";
  ownerId: number;
  slug: string;
  /** Book slug to scope an internal article to. Omit for standalone lookups. */
  bookSlug?: string | null;
}

/**
 * Finds the article a `(publisher, slug)` pair refers to, optionally scoped to
 * a book.
 *
 * Resolution order:
 *  1. With a book, the section of that book wins — that is the unambiguous case.
 *  2. Otherwise a standalone article with the slug wins. Standalone slugs stay
 *     globally unique, so this can never be ambiguous.
 *  3. Otherwise fall back to internal articles: exactly one match resolves (so
 *     existing bare wikilinks to book chapters keep working), more than one is
 *     reported as ambiguous.
 */
export async function findArticleBySlug({
  ownerType,
  ownerId,
  slug,
  bookSlug,
}: Params): Promise<ArticleLookup> {
  if (bookSlug) {
    const [book] = await db
      .select({ id: books.id })
      .from(books)
      .where(
        and(
          eq(books.slug, bookSlug),
          eq(books.ownerType, ownerType),
          eq(books.ownerId, ownerId),
          isNull(books.deletedAt)
        )
      )
      .limit(1);

    if (book) {
      const [scoped] = await db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.slug, slug),
            eq(articles.ownerType, ownerType),
            eq(articles.ownerId, ownerId),
            eq(articles.parentBookId, book.id),
            isNull(articles.deletedAt)
          )
        )
        .limit(1);
      if (scoped) return { kind: "found", article: scoped };
    }
    // Unknown book, or the book has no such section: fall through so a stale
    // `?book=` never hides an otherwise resolvable article.
  }

  const matches = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    );

  if (matches.length === 0) return { kind: "not-found" };

  const standalone = matches.find((a) => a.parentBookId === null);
  if (standalone) return { kind: "found", article: standalone };

  if (matches.length === 1) return { kind: "found", article: matches[0] };
  return { kind: "ambiguous", matches };
}
