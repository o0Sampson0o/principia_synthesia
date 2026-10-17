import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { resolvePublisher } from "@/lib/publisher";
import { findArticleBySlug } from "@/lib/article-lookup";
import { getBookRouteContext } from "@/lib/book-route";
import { resolvePath } from "@/lib/book-structure";
import { parseFrontmatter } from "@/lib/frontmatter";
import { excerptHtml, firstParagraph } from "@/lib/preview-excerpt";

/** What a hover preview shows for an internal link. */
export interface LinkPreview {
  kind: "article" | "book" | "section";
  title: string;
  /** Book title for a section; null otherwise. */
  context: string | null;
  /** Safe HTML: escaped text with inline maths typeset. */
  html: string;
}

// /:publisher/articles/:slug · /:publisher/books/:book · /:publisher/books/:book/…/:section
const PATH_RE = /^\/([a-z0-9-]+)\/(articles|books)\/([a-z0-9-]+)((?:\/[a-z0-9-]+)*)\/?$/;

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });

/**
 * GET /api/preview?path=/alice/articles/sets — the title and opening lines of
 * an internal page, for link hover previews. Answers only what the page itself
 * would show this session (same canView checks as the article, book and
 * section routes); anything else is a 404, so a preview never reveals a page
 * its link would not open.
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const m = PATH_RE.exec(path);
  if (!m) return notFound();
  const [, publisherSlug, type, slug, rest] = m;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) return notFound();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  const session = await getSession();

  let preview: LinkPreview | null = null;

  if (type === "articles") {
    if (rest) return notFound();
    const lookup = await findArticleBySlug({ ownerType, ownerId, slug, excludeBinnedParent: true });
    if (lookup.kind !== "found") return notFound();
    const article = lookup.article;
    if (article.isInternal) {
      // The article route redirects an internal section to its book, so the
      // book's visibility is what decides — exactly as there.
      if (!article.parentBookSlug) return notFound();
      if (!(await canView({ type: "book", ownerType, ownerId, slug: article.parentBookSlug }, session))) return notFound();
      const [parent] = await db.select({ title: books.title }).from(books).where(eq(books.id, article.parentBookId!)).limit(1);
      preview = articlePreview("section", article, parent?.title ?? null);
    } else {
      if (!(await canView({ type: "article", ownerType, ownerId, slug }, session))) return notFound();
      preview = articlePreview("article", article, null);
    }
  } else {
    const ctx = await getBookRouteContext(publisherSlug, slug);
    if (!ctx || !ctx.visible) return notFound();
    if (!rest) {
      preview = { kind: "book", title: ctx.book.title, context: null, html: excerptHtml(ctx.book.summary ?? "") };
    } else {
      const resolved = resolvePath(ctx.structure, rest.split("/").filter(Boolean));
      if (!resolved) return notFound();
      if (resolved.type === "divider") {
        preview = { kind: "section", title: resolved.node.title, context: ctx.book.title, html: "" };
      } else {
        const [article] = await db
          .select()
          .from(articles)
          .where(and(eq(articles.id, resolved.loc.section.articleId), isNull(articles.deletedAt)))
          .limit(1);
        if (!article) return notFound();
        if (article.isInternal) {
          const [parent] = await db.select({ id: books.id }).from(books).where(eq(books.id, article.parentBookId!)).limit(1);
          if (parent?.id !== ctx.book.id) return notFound();
        }
        preview = articlePreview("section", article, ctx.book.title);
      }
    }
  }

  return NextResponse.json(preview, {
    // Per-viewer (visibility depends on the session), but stable for minutes.
    headers: { "Cache-Control": "private, max-age=300" },
  });
}

function articlePreview(
  kind: "article" | "section",
  article: { title: string; summary: string | null; content: string | null },
  context: string | null
): LinkPreview {
  const text = article.summary?.trim() || firstParagraph(parseFrontmatter(article.content ?? "").body);
  return { kind, title: article.title, context, html: excerptHtml(text) };
}
