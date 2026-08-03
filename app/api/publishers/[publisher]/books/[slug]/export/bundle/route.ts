import { db } from "@/db";
import { withDividerTitles } from "@/lib/curriculum";
import { articles, books, curriculumEntries, events, objects, publishers, resourceVisibility, userThemes } from "@/db/schema";
import type { ThemeTokens } from "@/db/schema";
import { defaultLight } from "@/lib/theme";
import { eq, asc, and, inArray, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { buildBookBundle } from "@/lib/bundle/build-book-bundle";
import { readAnimationHeight } from "@/lib/animation-dimensions";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { getLicenseFromRequest, featureEnabled } from "@/lib/license";
import type { EventRow } from "@/lib/timeline-utils";

/** The exporting user's light theme tokens, falling back to the defaults. */
async function resolveLightTokens(userId: number | null): Promise<ThemeTokens> {
  if (userId === null) return defaultLight;
  const [row] = await db
    .select({ lightTokens: userThemes.lightTokens })
    .from(userThemes)
    .where(eq(userThemes.userId, userId))
    .limit(1);
  return row?.lightTokens ? { ...defaultLight, ...row.lightTokens } : defaultLight;
}

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher: publisherSlug, slug: bookSlug } = await params;
  const url = new URL(req.url);
  const includeEvents = url.searchParams.get("include") !== "no-events";

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
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
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
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position))
    .then((rows) =>
      withDividerTitles(
        rows.map((r) => ({ ...r, chapterTitle: null as string | null })),
        bookRow.id
      )
    );

  if (entries.length === 0) return new NextResponse("Book not found", { status: 404 });

  // Collect animation slugs referenced in any chapter
  const allContent = entries.map((e) => e.content ?? "").join("\n");
  const animSlugsRaw = [...allContent.matchAll(/<DynamicAnimation[^>]+slug="([^"]+)"/g)];
  const animSlugs = [...new Set(animSlugsRaw.map((m) => m[1]))];

  const animCodes = new Map<string, { code: string; height: number }>();
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
      // Carry the stored frame height so the export matches the web embed.
      if (code) animCodes.set(row.slug, { code, height: readAnimationHeight(row.content) });
    }
  }

  let publisherEvents: EventRow[] = [];
  if (includeEvents) {
    publisherEvents = await db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        description: events.description,
        eventDate: events.eventDate,
        category: events.category,
        isEraStart: events.isEraStart,
        isEraEnd: events.isEraEnd,
        eraName: events.eraName,
        publisherSlug: publishers.slug,
      })
      .from(events)
      .innerJoin(publishers, eq(publishers.slug, publisherSlug))
      .leftJoin(
        resourceVisibility,
        and(
          eq(resourceVisibility.resourceType, "event"),
          eq(resourceVisibility.ownerType, events.ownerType),
          eq(resourceVisibility.ownerId, events.ownerId),
          eq(resourceVisibility.resourceKey, events.slug)
        )
      )
      .where(
        and(
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId),
          or(
            isNull(resourceVisibility.visibility),
            eq(resourceVisibility.visibility, "public")
          )
        )
      );
  }

  // Palette for `window.theme` inside exported animations. Bundle pages are a
  // static light document, so the exporting user's light set (or the built-in
  // default) is the right one — there is no scheme to switch between offline.
  const themeTokens = await resolveLightTokens(session?.userId ?? null);

  const buffer = await buildBookBundle(
    bookSlug,
    bookRow.title,
    entries,
    animCodes,
    themeTokens,
    publisherEvents.length > 0 ? publisherEvents : undefined
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bookSlug}-bundle.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
