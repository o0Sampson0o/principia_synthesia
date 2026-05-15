import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildSyncBundle } from "@/lib/sync/build-sync-bundle";
import { getSession } from "@/lib/auth";

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const { book: bookSlug } = await params;
  const session = await getSession();

  if (!session?.isAdmin) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const entries = await db
    .select({
      bookTitle: curriculumEntries.bookTitle,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      slug: articles.slug,
      title: articles.title,
      isInternal: articles.isInternal,
      content: articles.content,
      updatedAt: articles.updatedAt,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .orderBy(asc(curriculumEntries.position));

  if (entries.length === 0) {
    return new NextResponse("Book not found", { status: 404 });
  }

  const bookTitle = entries[0].bookTitle;

  const buffer = await buildSyncBundle(
    bookSlug,
    bookTitle,
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
