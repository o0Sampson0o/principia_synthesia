import { db } from "@/db";
import { articles, books, curriculumEntries, events, pdfCaches, publishers, resourceVisibility } from "@/db/schema";
import { eq, asc, and, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { renderBookHtml } from "@/lib/pdf/render-book-html";
import { createHash } from "crypto";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { getLicenseFromRequest, featureEnabled } from "@/lib/license";
import type { EventRow } from "@/lib/timeline-utils";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher: publisherSlug, slug: bookSlug } = await params;
  const url = new URL(req.url);
  const includeEvents = url.searchParams.get("include") !== "no-events";

  // Resolve publisher
  const [pubRow] = await db
    .select({ kind: publishers.kind, userId: publishers.userId, orgId: publishers.orgId })
    .from(publishers)
    .where(eq(publishers.slug, publisherSlug))
    .limit(1);
  if (!pubRow) return new NextResponse("Not found", { status: 404 });

  const ownerType = pubRow.kind as "user" | "org";
  const ownerId = (pubRow.kind === "user" ? pubRow.userId : pubRow.orgId)!;

  // Resolve book
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
  if (!featureEnabled("PDF_EXPORT", license)) {
    return new NextResponse(
      JSON.stringify({ error: "PDF export requires a Pro license. Set PDF_EXPORT=true or provide a valid license key." }),
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

  let publisherEvents: (EventRow & { updatedAt: Date | null })[] = [];
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
        updatedAt: events.updatedAt,
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

  const sortedEventSnapshot = [...publisherEvents]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((e) => ({ id: e.id, updatedAt: e.updatedAt?.toISOString() ?? null }));

  const contentHash = createHash("sha256")
    .update(JSON.stringify({ bookTitle: bookRow.title, entries, events: sortedEventSnapshot }))
    .digest("hex");

  const [cached] = await db
    .select()
    .from(pdfCaches)
    .where(eq(pdfCaches.bookId, bookRow.id))
    .limit(1);

  if (cached?.contentHash === contentHash) {
    return new NextResponse(new Uint8Array(Buffer.from(cached.pdfData, "base64")), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${bookSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const html = await renderBookHtml(
    bookRow.title,
    entries,
    publisherEvents.length > 0 ? publisherEvents : undefined
  );

  const { chromium } = await import("playwright-core");
  let launchOptions: Parameters<typeof chromium.launch>[0];
  if (process.env.VERCEL) {
    const chromiumPkg = (await import("@sparticuz/chromium")).default;
    const binDir = await getChromiumBinDir();
    launchOptions = {
      args: chromiumPkg.args,
      executablePath: await chromiumPkg.executablePath(binDir),
      headless: true,
    };
  } else {
    launchOptions = { headless: true };
  }

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    await db.delete(pdfCaches).where(eq(pdfCaches.bookId, bookRow.id));
    await db.insert(pdfCaches).values({
      bookId: bookRow.id,
      pdfData: pdfBuffer.toString("base64"),
      contentHash,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${bookSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}

async function getChromiumBinDir(): Promise<string> {
  const { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync, createReadStream } =
    await import("fs");
  const { join } = await import("path");
  const { createGunzip } = await import("zlib");
  const { pipeline } = await import("stream/promises");
  const { extract } = await import("tar-fs");

  const binDir = "/tmp/chromium-bin";
  if (existsSync(join(binDir, "chromium.br"))) return binDir;

  const pkgPath = join(process.cwd(), "node_modules/@sparticuz/chromium/package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const version: string = pkg.version;
  const url = `https://registry.npmjs.org/@sparticuz/chromium/-/chromium-${version}.tgz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Chromium: ${res.status}`);

  const tarball = "/tmp/chromium-pkg.tgz";
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  mkdirSync(binDir, { recursive: true });

  await pipeline(
    createReadStream(tarball),
    createGunzip(),
    extract(binDir, {
      strip: 2,
      ignore: (_, header) => {
        if (header?.type === "directory") return true;
        return !["chromium.br", "fonts.tar.br", "swiftshader.tar.br", "al2023.tar.br"].includes(
          header?.name ?? ""
        );
      },
    })
  );

  unlinkSync(tarball);
  return binDir;
}
