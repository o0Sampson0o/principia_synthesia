import { notFound } from "next/navigation";
import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { parentBookNotBinned } from "@/lib/curriculum";
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
 *
 * This is the single place that decides what a `(publisher, slug)` pair means.
 * Anything resolving articles by slug should come through here so the page and
 * the sync API cannot drift apart on the question.
 */

export type ArticleRow = typeof articles.$inferSelect & {
  /** Owning book's slug for a section; null for a standalone article. */
  parentBookSlug: string | null;
};

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
  /** Skip sections whose parent book is in the bin (the sync API's rule). */
  excludeBinnedParent?: boolean;
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
 *
 * One query regardless of the path: the join carries each match's book slug, so
 * scoping is done in memory rather than with a second round-trip. That matters
 * because the article page resolves twice per request (metadata + body).
 */
export async function findArticleBySlug({
  ownerType,
  ownerId,
  slug,
  bookSlug,
  excludeBinnedParent = false,
}: Params): Promise<ArticleLookup> {
  const rows = await db
    .select({ article: articles, parentBookSlug: books.slug })
    .from(articles)
    .leftJoin(books, eq(articles.parentBookId, books.id))
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt),
        ...(excludeBinnedParent ? [parentBookNotBinned()] : [])
      )
    );

  const matches: ArticleRow[] = rows.map((r) => ({
    ...r.article,
    parentBookSlug: r.parentBookSlug,
  }));

  if (matches.length === 0) return { kind: "not-found" };

  if (bookSlug) {
    const scoped = matches.find((a) => a.parentBookSlug === bookSlug);
    if (scoped) return { kind: "found", article: scoped };
    // Unknown book, or the book has no such section: fall through so a stale
    // `?book=` never hides an otherwise resolvable article.
  }

  const standalone = matches.find((a) => a.parentBookId === null);
  if (standalone) return { kind: "found", article: standalone };

  if (matches.length === 1) return { kind: "found", article: matches[0] };
  return { kind: "ambiguous", matches };
}

/**
 * `findArticleBySlug` for routes with nothing useful to say about ambiguity:
 * anything but a single hit is a 404. Callers that want to offer a choice
 * (the article page) should use `findArticleBySlug` directly.
 */
export async function requireArticleBySlug(params: Params): Promise<ArticleRow> {
  const lookup = await findArticleBySlug(params);
  if (lookup.kind !== "found") notFound();
  return lookup.article;
}
