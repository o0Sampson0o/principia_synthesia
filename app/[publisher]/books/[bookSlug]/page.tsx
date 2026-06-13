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
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-sm themed-muted mb-1">
          <Link href={`/${publisherSlug}`} className="themed-link">
            @{publisherSlug}
          </Link>
        </p>
        <h1 className="text-4xl font-bold themed-heading">{bookRow.title}</h1>
        {bookRow.summary && (
          <p className="mt-3 text-lg themed-muted leading-relaxed max-w-3xl">
            {bookRow.summary}
          </p>
        )}
        {bookCats.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {bookCats.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="px-2 py-0.5 rounded-full text-xs font-medium themed-surface border themed-border hover:themed-surface-hover transition-colors"
              >
                #{c.slug}
              </Link>
            ))}
          </div>
        )}
        {isEditor && (
          <div className="flex gap-3 mt-4">
            <Link href={`/${publisherSlug}/books/${bookSlug}/edit`} className="text-sm themed-link">
              Edit curriculum
            </Link>
            <Link href={`/${publisherSlug}/books/${bookSlug}/access`} className="text-sm themed-link">
              Access
            </Link>
            <Link
              href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/pdf`}
              className="text-sm themed-link"
            >
              PDF
            </Link>
            <Link
              href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/epub`}
              className="text-sm themed-link"
            >
              EPUB
            </Link>
            <Link
              href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/bundle`}
              className="text-sm themed-link"
            >
              Bundle
            </Link>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="themed-muted">No chapters yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, idx) => {
            const isExternal =
              e.articlePublisherSlug !== null &&
              e.articlePublisherSlug !== publisherSlug;
            return (
              <li key={e.id}>
                {e.partTitle && (
                  <p className="text-xs themed-muted uppercase tracking-wider mt-4 mb-1">
                    {e.partTitle}
                  </p>
                )}
                <span className="block">
                  <Link
                    href={`/${publisherSlug}/books/${bookSlug}/${e.articleSlug}`}
                    className="themed-link"
                  >
                    <span className="text-sm themed-muted mr-2">{idx + 1}.</span>
                    {e.articleTitle}
                  </Link>
                  {isExternal && (
                    <span className="ml-2 text-xs themed-muted">
                      by{" "}
                      <Link
                        href={`/${e.articlePublisherSlug}`}
                        className="themed-link"
                      >
                        @{e.articlePublisherSlug}
                      </Link>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
