import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, articles, curriculumEntries } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
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

  const entries = await db
    .select({
      id: curriculumEntries.id,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: articles.id,
      articleSlug: articles.slug,
      articleTitle: articles.title,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-sm themed-muted mb-1">
          <Link href={`/${publisherSlug}`} className="themed-link">
            @{publisherSlug}
          </Link>
        </p>
        <h1 className="text-4xl font-bold themed-heading">{bookRow.title}</h1>
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
          {entries.map((e, idx) => (
            <li key={e.id}>
              {e.partTitle && (
                <p className="text-xs themed-muted uppercase tracking-wider mt-4 mb-1">
                  {e.partTitle}
                </p>
              )}
              <Link
                href={`/${publisherSlug}/books/${bookSlug}/${e.articleSlug}`}
                className="themed-link"
              >
                <span className="text-sm themed-muted mr-2">{idx + 1}.</span>
                {e.articleTitle}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
