import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildEpub } from "@/lib/epub";
import { getSession } from "@/lib/auth";
import { canViewBook } from "@/lib/access";
import { getLicenseFromRequest, featureEnabled } from "@/lib/license";

/**
 * GET /api/curriculum/[book]/export/epub
 *
 * Returns the book as an EPUB3 file. Each curriculum entry becomes one chapter.
 * Content is converted from MDX to sanitized HTML using the standard remark/rehype
 * pipeline. Math expressions are rendered to inline SVG via MathJax (liteAdaptor),
 * which is compatible with Kindle, Apple Books, and Thorium.
 *
 * Returns 404 if the book has no entries.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const { book: bookSlug } = await params;

  const session = await getSession();
  if (!(await canViewBook(bookSlug, session))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const license = await getLicenseFromRequest(req);
  if (!featureEnabled("EPUB_EXPORT", license)) {
    return new NextResponse(
      JSON.stringify({ error: "EPUB export requires a Pro license. Set EPUB_EXPORT=true or provide a valid license key." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const entries = await db
    .select({
      bookTitle: curriculumEntries.bookTitle,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      title: articles.title,
      content: articles.content,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .orderBy(asc(curriculumEntries.position));

  if (entries.length === 0) {
    return new NextResponse("Book not found", { status: 404 });
  }

  const bookTitle = entries[0].bookTitle;

  const buffer = await buildEpub({
    title: bookTitle,
    chapters: entries.map((e) => ({
      title: e.title,
      content: e.content,
      partTitle: e.partTitle,
    })),
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${bookSlug}.epub"`,
      "Cache-Control": "no-store",
    },
  });
}
