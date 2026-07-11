import { NextResponse } from "next/server";
import { db } from "@/db";
import { articles, books, curriculumEntries } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { authorizePublisherRequest } from "@/lib/api-v1";

/**
 * GET /api/v1/publishers/[publisher]/books/[slug] — a book's ordered chapter
 * list (read-only). Mirrors the curriculum join used by the sync-bundle
 * export route.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher, slug } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const [book] = await db
    .select({ id: books.id, slug: books.slug, title: books.title, summary: books.summary })
    .from(books)
    .where(
      and(eq(books.slug, slug), eq(books.ownerType, auth.ownerType), eq(books.ownerId, auth.ownerId))
    )
    .limit(1);
  if (!book) {
    return NextResponse.json({ error: "book_not_found" }, { status: 404 });
  }

  const chapters = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: articles.id,
      articleSlug: articles.slug,
      title: articles.title,
      isInternal: articles.isInternal,
    })
    .from(curriculumEntries)
    .innerJoin(
      articles,
      and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt))
    )
    .where(eq(curriculumEntries.bookId, book.id))
    .orderBy(asc(curriculumEntries.position));

  return NextResponse.json({
    slug: book.slug,
    title: book.title,
    summary: book.summary,
    chapters,
  });
}
