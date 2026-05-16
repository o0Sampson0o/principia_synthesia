import { db } from "@/db";
import { articles, books, curriculumEntries, objects, publishers } from "@/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildBookBundle } from "@/lib/bundle/build-book-bundle";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { getLicenseFromRequest, featureEnabled } from "@/lib/license";

export const maxDuration = 60;

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
  if (!featureEnabled("BUNDLE_EXPORT", license)) {
    return new NextResponse(
      JSON.stringify({ error: "Bundle export requires a Pro license. Set BUNDLE_EXPORT=true or provide a valid license key." }),
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

  // Collect animation slugs referenced in any chapter
  const allContent = entries.map((e) => e.content ?? "").join("\n");
  const animSlugsRaw = [...allContent.matchAll(/<DynamicAnimation[^>]+slug="([^"]+)"/g)];
  const animSlugs = [...new Set(animSlugsRaw.map((m) => m[1]))];

  const animCodes = new Map<string, string>();
  if (animSlugs.length > 0) {
    const rows = await db
      .select({ slug: objects.slug, content: objects.content })
      .from(objects)
      .where(
        and(
          eq(objects.type, "animation"),
          eq(objects.ownerType, ownerType),
          eq(objects.ownerId, ownerId),
          inArray(objects.slug, animSlugs)
        )
      );
    for (const row of rows) {
      const code = (row.content as { code?: string }).code;
      if (code) animCodes.set(row.slug, code);
    }
  }

  const buffer = await buildBookBundle(bookSlug, bookRow.title, entries, animCodes);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bookSlug}-bundle.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
