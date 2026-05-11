import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { renderBookHtml } from "@/lib/pdf/render-book-html";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const { book: bookSlug } = await params;

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
  const html = await renderBookHtml(bookTitle, entries);

  const { chromium } = await import("playwright-core");

  let launchOptions: Parameters<typeof chromium.launch>[0];
  if (process.env.VERCEL) {
    const chromiumPkg = (await import("@sparticuz/chromium")).default;
    launchOptions = {
      args: chromiumPkg.args,
      executablePath: await chromiumPkg.executablePath(),
      headless: true,
    };
  } else {
    launchOptions = { channel: "chrome", headless: true };
  }

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
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
