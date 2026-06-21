import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, articles, curriculumEntries, publishers, bookCategories, categories } from "@/db/schema";
import { eq, and, asc, or, sql, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";

export default async function BookPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [bookRow] = await db
    .select()
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!bookRow) notFound();

  const session = await getSession();
  if (!(await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session))) notFound();

  const isEditor = await canEditContent(session, ownerType, ownerId);

  // Categories
  const bookCats = await db
    .select({ slug: categories.slug })
    .from(bookCategories)
    .innerJoin(categories, eq(bookCategories.categoryId, categories.id))
    .where(eq(bookCategories.bookId, bookRow.id));

  const entries = await db
    .select({
      id: curriculumEntries.id,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: articles.id,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      articlePublisherSlug: publishers.slug,
    })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .leftJoin(
      publishers,
      or(
        and(
          eq(articles.ownerType, sql`'user'`),
          eq(publishers.userId, articles.ownerId)
        ),
        and(
          eq(articles.ownerType, sql`'org'`),
          eq(publishers.orgId, articles.ownerId)
        )
      )
    )
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  return (
    <main className="max-w-4xl mx-auto px-5 py-12 sm:py-16">

      {/* ── Header ── */}
      <Link href={`/${publisherSlug}`} className="ps-eyebrow inline-block mb-6 hover:opacity-70 transition-opacity">
        {pub.displayName}
      </Link>

      <div className="mb-10">
        <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
          {bookRow.title}
        </h1>
        {bookRow.summary && (
          <p className="themed-muted" style={{ fontSize: "1.0625rem", lineHeight: 1.7 }}>
            {bookRow.summary}
          </p>
        )}
        {bookCats.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5">
            {bookCats.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} className="themed-tag">
                #{c.slug}
              </Link>
            ))}
          </div>
        )}
        {isEditor && (
          <div className="ps-action-bar mt-5">
            <Link href={`/${publisherSlug}/books/${bookSlug}/edit`} className="themed-btn-outline" style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}>
              Edit
            </Link>
            <Link href={`/${publisherSlug}/books/${bookSlug}/access`} className="themed-btn-outline" style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}>
              Access
            </Link>
            <Link href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/pdf`} className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              PDF
            </Link>
            <Link href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/epub`} className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              EPUB
            </Link>
            <Link href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/bundle`} className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              Bundle
            </Link>
          </div>
        )}
      </div>

      <hr className="themed-hr" />

      {/* ── Chapters ── */}
      {entries.length === 0 ? (
        <p className="themed-muted mt-8" style={{ fontSize: "0.9375rem" }}>No chapters yet.</p>
      ) : (
        <div className="ps-content-box mt-0 border-t-0 rounded-none rounded-b-lg">
          {entries.map((e, idx) => {
            const isExternal = e.articlePublisherSlug !== null && e.articlePublisherSlug !== publisherSlug;
            return (
              <div key={e.id} className="ps-content-row flex-col items-start gap-0.5">
                {e.partTitle && (
                  <p className="ps-eyebrow-muted mb-2">{e.partTitle}</p>
                )}
                <div className="flex items-baseline gap-3 w-full min-w-0">
                  <span className="tabular-nums shrink-0" style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <Link href={`/${publisherSlug}/books/${bookSlug}/${e.articleSlug}`} className="ps-list-link flex-1 min-w-0">
                    {e.articleTitle}
                  </Link>
                  {isExternal && (
                    <span className="themed-muted shrink-0" style={{ fontSize: "0.75rem" }}>
                      <Link href={`/${e.articlePublisherSlug}`} className="themed-nav-link hover:text-[var(--foreground)] transition-colors">
                        @{e.articlePublisherSlug}
                      </Link>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}
