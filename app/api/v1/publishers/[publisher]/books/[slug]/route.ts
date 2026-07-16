import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { articles, books, curriculumEntries } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  authorizePublisherRequest,
  getIfMatchHash,
  preconditionRequired,
} from "@/lib/api-v1";
import {
  BookChapterSetMismatchError,
  BookNotFoundError,
  BookStructureConflictError,
  computeStructureHash,
  updateBookStructureCore,
} from "@/lib/books-write";
import { apiUpdateBookStructureSchema } from "@/lib/validations";

/**
 * GET /api/v1/publishers/[publisher]/books/[slug] — a book's ordered chapter
 * list, with a structureHash for optimistic concurrency on PUT.
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
      and(eq(books.slug, slug), eq(books.ownerType, auth.ownerType), eq(books.ownerId, auth.ownerId), isNull(books.deletedAt))
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

  const structureHash = computeStructureHash(
    chapters.map((c) => ({ articleSlug: c.articleSlug, partTitle: c.partTitle }))
  );

  return NextResponse.json(
    { slug: book.slug, title: book.title, summary: book.summary, chapters, structureHash },
    { headers: { ETag: `"${structureHash}"` } }
  );
}

/**
 * PUT /api/v1/publishers/[publisher]/books/[slug] — reorder chapters and
 * change their part groupings. The chapter set must match the book's current
 * set (add/remove stays in the web UI). Requires If-Match with the structure
 * hash; 412 on conflict, 409 if the chapter set differs.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher, slug } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const baseHash = getIfMatchHash(request);
  if (!baseHash) return preconditionRequired();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = apiUpdateBookStructureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const result = await updateBookStructureCore({
      ownerType: auth.ownerType,
      ownerId: auth.ownerId,
      bookSlug: slug,
      chapters: parsed.data.chapters,
      expectedStructureHash: baseHash,
    });
    revalidatePath(`/${publisher}/books/${slug}`);
    return NextResponse.json({ structureHash: result.structureHash, updatedAt: result.updatedAt });
  } catch (err) {
    if (err instanceof BookStructureConflictError) {
      return NextResponse.json(
        {
          error: "conflict",
          remoteStructureHash: err.remoteStructureHash,
          remoteUpdatedAt: err.remoteUpdatedAt,
        },
        { status: 412 }
      );
    }
    if (err instanceof BookChapterSetMismatchError) {
      return NextResponse.json(
        {
          error: "chapter_set_mismatch",
          added: err.added,
          removed: err.removed,
          message:
            "Add or remove chapters in the web UI; ps-sync only reorders and re-groups existing chapters.",
        },
        { status: 409 }
      );
    }
    if (err instanceof BookNotFoundError) {
      return NextResponse.json({ error: "book_not_found" }, { status: 404 });
    }
    throw err;
  }
}
