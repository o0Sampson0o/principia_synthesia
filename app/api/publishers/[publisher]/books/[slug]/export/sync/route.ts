import { db } from "@/db";
import { articles, books, curriculumEntries, publishers } from "@/db/schema";
import { eq, asc, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildSyncBundle } from "@/lib/sync/build-sync-bundle";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher: publisherSlug, slug: bookSlug } = await params;

  const [pubRow] = await db
    .select({ kind: publishers.kind, userId: publishers.userId, orgId: publishers.orgId })
    .from(publishers)
    .where(eq(publishers.slug, publisherSlug))
    .limit(1);
  if (!pubRow) return new NextResponse("Not found", { status: 404 });

  const ownerType = pubRow.kind as "user" | "org";
  const ownerId = (pubRow.kind === "user" ? pubRow.userId : pubRow.orgId)!;

  // Sync export is admin-only (requires edit rights on the publisher)
  const session = await getSession();
  if (!(await canEditContent(session, ownerType, ownerId))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [bookRow] = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!bookRow) return new NextResponse("Not found", { status: 404 });

  const entries = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      slug: articles.slug,
      title: articles.title,
      isInternal: articles.isInternal,
      content: articles.content,
      updatedAt: articles.updatedAt,
    })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  if (entries.length === 0) return new NextResponse("Book not found", { status: 404 });

  const buffer = await buildSyncBundle(
    bookSlug,
    bookRow.title,
    entries.map((e) => ({
      slug: e.slug,
      title: e.title,
      partTitle: e.partTitle,
      position: e.position,
      isInternal: e.isInternal,
      updatedAt: e.updatedAt,
      content: e.content,
    }))
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bookSlug}-sync.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
