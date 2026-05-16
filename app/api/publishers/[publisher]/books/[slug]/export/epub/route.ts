import { db } from "@/db";
import { articles, books, curriculumEntries, publishers } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildEpub } from "@/lib/epub";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { getLicenseFromRequest, featureEnabled } from "@/lib/license";

export async function GET(
  req: Request,
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

  const [bookRow] = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!bookRow) return new NextResponse("Not found", { status: 404 });

  const session = await getSession();
  if (!(await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session))) {
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
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      title: articles.title,
      content: articles.content,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  if (entries.length === 0) return new NextResponse("Book not found", { status: 404 });

  const buffer = await buildEpub({
    title: bookRow.title,
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
