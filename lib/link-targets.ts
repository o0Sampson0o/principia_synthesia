"use server";

import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { searchAll } from "@/lib/search";
import type { LinkTarget } from "@/lib/link-target-format";

const OWN_LIMIT = 12;
const OTHER_LIMIT = 6;

/**
 * Wikilink targets for the editor's `[[` completion, matched by TITLE.
 *
 * The author's own publisher comes first and includes everything they can
 * edit — drafts, private articles, book sections — since linking to your own
 * unpublished page is normal while writing. Other publishers' pages come from
 * `searchAll`, so they are exactly what this session may already see. An empty
 * query lists the author's most recently edited pages.
 */
export async function searchLinkTargets(publisherSlug: string, query: string): Promise<LinkTarget[]> {
  const q = query.trim().slice(0, 100);
  const session = await getSession();
  const pub = await resolvePublisher(publisherSlug);
  const own: LinkTarget[] = [];

  if (pub && session) {
    const ownerType = pub.kind === "user" ? "user" : "org";
    const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
    if (await canEditContent(session, ownerType, ownerId)) {
      const parent = alias(books, "parent_book");
      const titleMatch = q ? ilike(articles.title, `%${q}%`) : undefined;
      const [arts, bks] = await Promise.all([
        db
          .select({
            title: articles.title,
            slug: articles.slug,
            isInternal: articles.isInternal,
            bookSlug: parent.slug,
            bookTitle: parent.title,
          })
          .from(articles)
          .leftJoin(parent, eq(articles.parentBookId, parent.id))
          .where(
            and(
              eq(articles.ownerType, ownerType),
              eq(articles.ownerId, ownerId),
              isNull(articles.deletedAt),
              // An internal section of a binned book is gone with its book.
              or(isNull(articles.parentBookId), isNull(parent.deletedAt)),
              titleMatch
            )
          )
          .orderBy(desc(articles.updatedAt))
          .limit(OWN_LIMIT),
        db
          .select({ title: books.title, slug: books.slug })
          .from(books)
          .where(
            and(
              eq(books.ownerType, ownerType),
              eq(books.ownerId, ownerId),
              isNull(books.deletedAt),
              q ? ilike(books.title, `%${q}%`) : undefined
            )
          )
          .orderBy(desc(books.updatedAt))
          .limit(4),
      ]);
      for (const a of arts) {
        own.push(
          a.isInternal && a.bookSlug
            ? { kind: "section", title: a.title, publisherSlug, slug: a.slug, bookSlug: a.bookSlug, bookTitle: a.bookTitle ?? a.bookSlug }
            : { kind: "article", title: a.title, publisherSlug, slug: a.slug }
        );
      }
      for (const b of bks) own.push({ kind: "book", title: b.title, publisherSlug, slug: b.slug });
    }
  }

  const others: LinkTarget[] = [];
  if (q.length >= 2) {
    const res = await searchAll(q);
    const needle = q.toLowerCase();
    for (const a of res.articles) {
      if (a.publisherSlug === publisherSlug && own.length > 0) continue;
      if (!a.title.toLowerCase().includes(needle)) continue;
      others.push(
        a.parentBookSlug
          ? { kind: "section", title: a.title, publisherSlug: a.publisherSlug, slug: a.slug, bookSlug: a.parentBookSlug, bookTitle: a.parentBookSlug }
          : { kind: "article", title: a.title, publisherSlug: a.publisherSlug, slug: a.slug }
      );
    }
    for (const b of res.books) {
      if (b.publisherSlug === publisherSlug && own.length > 0) continue;
      if (!b.title.toLowerCase().includes(needle)) continue;
      others.push({ kind: "book", title: b.title, publisherSlug: b.publisherSlug, slug: b.slug });
    }
  }

  return [...rankByTitle(own, q), ...rankByTitle(others, q).slice(0, OTHER_LIMIT)];
}

/** Title starts-with before contains; stable otherwise (keeps recency order). */
function rankByTitle(targets: LinkTarget[], q: string): LinkTarget[] {
  if (!q) return targets;
  const needle = q.toLowerCase();
  return targets
    .map((t, i) => ({ t, i, prefix: t.title.toLowerCase().startsWith(needle) ? 0 : 1 }))
    .sort((a, b) => a.prefix - b.prefix || a.i - b.i)
    .map((x) => x.t);
}
