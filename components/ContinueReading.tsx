import { db } from "@/db";
import { articles, articleCategories, books, curriculumEntries, publishers } from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";
import { canView } from "@/lib/access";
import { formatDate } from "@/lib/format-date";
import SectionHeader from "./SectionHeader";

interface Props {
  articleId: number;
  ownerType: "user" | "org";
  ownerId: number;
  publisherSlug: string;
  categoryIds: number[];
  session: SessionPayload | null;
}

interface BookPath {
  bookTitle: string;
  bookHref: string;
  nextTitle: string | null;
  nextHref: string | null;
}

interface ArticlePath {
  title: string;
  href: string;
  updatedAt: Date | null;
}

const RELATED_LIMIT = 3;

/**
 * The post-article pathway ("readers who return"): where to go once the
 * prose ends. Priority cascade — the book this article belongs to (with its
 * next chapter), then same-publisher articles sharing a category, then the
 * publisher's latest. Renders nothing when the corpus offers no onward step.
 */
export default async function ContinueReading({
  articleId,
  ownerType,
  ownerId,
  publisherSlug,
  categoryIds,
  session,
}: Props) {
  // ── 1. Book membership: is this article a chapter somewhere? ──────────
  const containing = await db
    .select({
      bookId: books.id,
      bookSlug: books.slug,
      bookTitle: books.title,
      position: curriculumEntries.position,
      bookPublisherSlug: publishers.slug,
    })
    .from(curriculumEntries)
    .innerJoin(books, and(eq(curriculumEntries.bookId, books.id), isNull(books.deletedAt)))
    .leftJoin(
      publishers,
      sql`(
        (${books.ownerType} = 'user' AND ${publishers.userId} = ${books.ownerId} AND ${publishers.kind} = 'user')
        OR
        (${books.ownerType} = 'org' AND ${publishers.orgId} = ${books.ownerId} AND ${publishers.kind} = 'org')
      )`
    )
    .where(eq(curriculumEntries.articleId, articleId))
    .limit(2);

  const bookPaths: BookPath[] = [];
  for (const c of containing) {
    if (!c.bookPublisherSlug) continue;
    // Book must be visible to this reader
    const visible = await canView(
      { type: "book", ownerType, ownerId, slug: c.bookSlug },
      session
    );
    if (!visible) continue;

    const [next] = await db
      .select({ slug: articles.slug, title: articles.title })
      .from(curriculumEntries)
      .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
      .where(
        and(
          eq(curriculumEntries.bookId, c.bookId),
          sql`${curriculumEntries.position} > ${c.position}`
        )
      )
      .orderBy(asc(curriculumEntries.position))
      .limit(1);

    bookPaths.push({
      bookTitle: c.bookTitle,
      bookHref: `/${c.bookPublisherSlug}/books/${c.bookSlug}`,
      nextTitle: next?.title ?? null,
      nextHref: next ? `/${c.bookPublisherSlug}/books/${c.bookSlug}/${next.slug}` : null,
    });
  }

  // ── 2. Related by shared category (same publisher), else latest ───────
  const baseConds = and(
    eq(articles.ownerType, ownerType),
    eq(articles.ownerId, ownerId),
    ne(articles.id, articleId),
    eq(articles.isInternal, false),
    isNull(articles.deletedAt),
    sql`${articles.metadata}->>'status' = 'published'`
  );

  let candidates: { slug: string; title: string; updatedAt: Date | null }[] = [];
  if (categoryIds.length > 0) {
    candidates = await db
      .selectDistinct({ slug: articles.slug, title: articles.title, updatedAt: articles.updatedAt })
      .from(articles)
      .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
      .where(and(baseConds, inArray(articleCategories.categoryId, categoryIds)))
      .orderBy(desc(articles.updatedAt))
      .limit(RELATED_LIMIT + 2);
  }
  if (candidates.length === 0) {
    candidates = await db
      .select({ slug: articles.slug, title: articles.title, updatedAt: articles.updatedAt })
      .from(articles)
      .where(baseConds)
      .orderBy(desc(articles.updatedAt))
      .limit(RELATED_LIMIT + 2);
  }

  const related: ArticlePath[] = [];
  for (const c of candidates) {
    if (related.length >= RELATED_LIMIT) break;
    const visible = await canView(
      { type: "article", ownerType, ownerId, slug: c.slug },
      session
    );
    if (!visible) continue;
    related.push({
      title: c.title,
      href: `/${publisherSlug}/articles/${c.slug}`,
      updatedAt: c.updatedAt,
    });
  }

  if (bookPaths.length === 0 && related.length === 0) return null;

  return (
    <section className="mt-16">
      <SectionHeader title="Continue reading" />
      <div className="mt-4 space-y-4">
        {bookPaths.map((b) => (
          <div key={b.bookHref} className="text-sm">
            <span className="themed-muted">Part of </span>
            <Link href={b.bookHref} className="themed-link font-medium">
              {b.bookTitle}
            </Link>
            {b.nextTitle && b.nextHref && (
              <span className="block mt-1">
                <span className="themed-muted">Next chapter: </span>
                <Link href={b.nextHref} className="themed-link">
                  {b.nextTitle}
                </Link>
                <span className="themed-muted" aria-hidden="true"> →</span>
              </span>
            )}
          </div>
        ))}

        {related.length > 0 && (
          <ul className="space-y-2">
            {related.map((a) => (
              <li key={a.href} className="text-sm">
                <Link href={a.href} className="themed-link">
                  {a.title}
                </Link>
                {a.updatedAt && (
                  <span className="themed-muted ps-mono-meta ml-2">{formatDate(a.updatedAt)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
