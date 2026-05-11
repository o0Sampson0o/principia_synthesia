import { db } from "@/db";
import { articles, curriculumEntries, pdfCaches } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { renderBookHtml } from "@/lib/pdf/render-book-html";
import { createHash } from "crypto";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const { book: bookSlug } = await params;

  const entries = await db
    .select({
      bookTitle: curriculumEntries.bookTitle,
      articleId: curriculumEntries.articleId,
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

  // --- Cache check ---

  const contentHash = createHash("sha256")
    .update(JSON.stringify({ bookTitle, entries }))
    .digest("hex");

  const cached = await db
    .select()
    .from(pdfCaches)
    .where(eq(pdfCaches.bookSlug, bookSlug))
    .limit(1);

  if (cached[0]?.contentHash === contentHash) {
    return new NextResponse(new Uint8Array(Buffer.from(cached[0].pdfData, "base64")), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${bookSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // --- Generate PDF ---

  const html = await renderBookHtml(bookTitle, entries);

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
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    // --- Update cache ---

    await db.delete(pdfCaches).where(eq(pdfCaches.bookSlug, bookSlug));
    await db.insert(pdfCaches).values({
      bookSlug,
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

/**
 * On cold start, downloads the @sparticuz/chromium npm tarball and extracts
 * the `bin/` directory to /tmp so the Chromium binary can be inflated.
 * On warm start, /tmp/chromium-bin/chromium.br already exists — returns
 * immediately without downloading.
 */
async function getChromiumBinDir(): Promise<string> {
  const { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } =
    await import("fs");
  const { join } = await import("path");

  const binDir = "/tmp/chromium-bin";

  if (existsSync(join(binDir, "chromium.br"))) {
    return binDir;
  }

  const pkgPath = join(
    process.cwd(),
    "node_modules/@sparticuz/chromium/package.json"
  );
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const version: string = pkg.version;

  const url = `https://registry.npmjs.org/@sparticuz/chromium/-/chromium-${version}.tgz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Chromium: ${res.status}`);

  const tarball = "/tmp/chromium-pkg.tgz";
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));

  mkdirSync(binDir, { recursive: true });

  const { execSync } = await import("child_process");
  execSync(
    `tar xzf ${tarball} --strip-components=2 -C ${binDir} 'package/bin/'`
  );

  unlinkSync(tarball);

  return binDir;
}
