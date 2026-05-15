import { db } from "@/db";
import { articles, curriculumEntries, objects } from "@/db/schema";
import { eq, asc, inArray, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildBookBundle } from "@/lib/bundle/build-book-bundle";
import { getSession } from "@/lib/auth";
import { canViewBook } from "@/lib/access";
import { getLicenseFromRequest, featureEnabled } from "@/lib/license";

export const maxDuration = 60;

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
  if (!featureEnabled("BUNDLE_EXPORT", license)) {
    return new NextResponse(
      JSON.stringify({ error: "Bundle export requires a Pro license. Set BUNDLE_EXPORT=true or provide a valid license key." }),
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

  // Collect animation slugs referenced in any chapter
  const allContent = entries.map((e) => e.content ?? "").join("\n");
  const animSlugsRaw = [...allContent.matchAll(/<DynamicAnimation[^>]+slug="([^"]+)"/g)];
  const animSlugs = [...new Set(animSlugsRaw.map((m) => m[1]))];

  const animCodes = new Map<string, string>();
  if (animSlugs.length > 0) {
    const rows = await db
      .select({ slug: objects.slug, content: objects.content })
      .from(objects)
      .where(and(eq(objects.type, "animation"), inArray(objects.slug, animSlugs)));
    for (const row of rows) {
      const code = (row.content as { code?: string }).code;
      if (code) animCodes.set(row.slug, code);
    }
  }

  const buffer = await buildBookBundle(bookSlug, bookTitle, entries, animCodes);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bookSlug}-bundle.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
