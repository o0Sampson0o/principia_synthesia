import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, articles, articleViews, publishers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import { prepareArticleBody, resolveCitations } from "@/lib/article-mdx";
import { buildKatexMacros, extractMacroSource } from "@/lib/katex-macros";
import ArticleBody from "@/components/ArticleBody";
import { headers } from "next/headers";
import { classifyReferrer } from "@/lib/analytics-source";
import { getOrCreateSessionId } from "@/lib/analytics-session";
import { config } from "@/lib/config";
import CommentThread from "@/components/CommentThread";
import ArticleToc from "@/components/ArticleToc";
import ArticleSectionRail from "@/components/ArticleSectionRail";
import { extractToc } from "@/lib/article-toc";
import {
  loadBookStructure,
  resolvePath,
  sectionHref,
  dividerHref,
} from "@/lib/book-structure";
import BookBreadcrumb, { type Crumb } from "@/components/book/BookBreadcrumb";
import BookDividerToc from "@/components/book/BookDividerToc";
import CopySnippet from "@/components/CopySnippet";
import { formatWikilink } from "@/lib/wikilink-syntax";

export default async function BookSectionPage({
  params,
}: {
  // Catch-all: flexible path of part/chapter/article slugs. Resolution keys off
  // the LAST segment (see lib/book-structure resolvePath), so intermediate
  // segments are optional — /book/part/chapter/article, /book/article, etc.
  params: Promise<{ publisher: string; bookSlug: string; section: string[] }>;
}) {
  const { publisher: publisherSlug, bookSlug, section } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [bookRow] = await db
    .select()
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!bookRow) notFound();

  const session = await getSession();
  if (!(await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session))) notFound();

  const structure = await loadBookStructure(bookRow.id);
  const resolved = resolvePath(structure, section);
  if (!resolved) notFound();

  // ── Part / Chapter → on-the-fly Table of Contents ─────────────────────────
  if (resolved.type === "divider") {
    return (
      <BookDividerToc
        publisherSlug={publisherSlug}
        bookSlug={bookSlug}
        bookTitle={bookRow.title}
        node={resolved.node}
        part={resolved.part}
      />
    );
  }

  // ── Section (article) ─────────────────────────────────────────────────────
  const { loc } = resolved;
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, loc.section.articleId), isNull(articles.deletedAt)))
    .limit(1);
  if (!article) notFound();
  if (article.isInternal && article.parentBookId !== bookRow.id) notFound();

  {
    const siteHost = new URL(config.siteUrl).host;
    const [hdrs, sessionId] = await Promise.all([headers(), getOrCreateSessionId()]);
    const referrer = hdrs.get("referer");
    db.insert(articleViews)
      .values({
        articleId: article.id,
        referrer: referrer?.slice(0, 2000) ?? null,
        referrerSource: classifyReferrer(referrer, siteHost),
        sessionId,
      })
      .catch(() => {});
  }

  const articleOwnerType = article.ownerType as "user" | "org";
  const articleOwnerId = article.ownerId;
  const [articlePublisherRow] = await db
    .select({ slug: publishers.slug })
    .from(publishers)
    .where(
      articleOwnerType === "user"
        ? eq(publishers.userId, articleOwnerId)
        : eq(publishers.orgId, articleOwnerId)
    )
    .limit(1);
  const articlePublisherSlug = articlePublisherRow?.slug ?? publisherSlug;

  const isEditor = await canEditContent(session, articleOwnerType, articleOwnerId);

  // Prev/next span the flat section order (dividers excluded).
  const total = structure.orderedSections.length;
  const idx = loc.flatIndex;
  const prevSlug = idx > 0 ? structure.orderedSections[idx - 1].slug : null;
  const nextSlug = idx < total - 1 ? structure.orderedSections[idx + 1].slug : null;

  const { body, renderedBody } = prepareArticleBody(article.content ?? "", { publisherSlug });
  // Book macros reach internal sections only. A standalone article a book links
  // to also has a page outside the book, where these definitions do not exist —
  // inheriting them here would make it render differently in the two places.
  const katexMacros = buildKatexMacros(
    article.isInternal ? bookRow.metadata.macros : null,
    extractMacroSource(body)
  );
  const toc = extractToc(body);
  const { slugToNumber, resolved: resolvedCitations } = await resolveCitations(body);

  const crumbs: Crumb[] = [
    { label: `@${publisherSlug}`, href: `/${publisherSlug}` },
    { label: bookRow.title, href: `/${publisherSlug}/books/${bookSlug}` },
  ];
  if (loc.part) crumbs.push({ label: loc.part.title, href: dividerHref(publisherSlug, bookSlug, loc.part) });
  if (loc.chapter) crumbs.push({ label: loc.chapter.title, href: dividerHref(publisherSlug, bookSlug, loc.chapter) });
  crumbs.push({ label: article.title });

  return (
    // main + rail are siblings inside .ps-book-reading, which is the flex row.
    <>
    <main className="ps-doc w-full">

      {/* ── Framed section header ────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-3xl mx-auto px-5">

          {/* Breadcrumb + edit row */}
          <div
            className="flex items-center justify-between py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <BookBreadcrumb crumbs={crumbs} />
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <span
                className="themed-muted hidden sm:block"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {idx + 1} / {total}
              </span>
              <CopySnippet
                value={
                  article.isInternal
                    ? // Book-qualified: a section slug is only unique inside its
                      // own book, so the bare form could mean another book's.
                      formatWikilink({
                        publisher: publisherSlug,
                        type: "books",
                        slug: bookSlug,
                        section: article.slug,
                        label: article.title,
                      })
                    : // Borrowed: a standalone article owned elsewhere, so its
                      // canonical address is against its own publisher.
                      formatWikilink({
                        publisher: articlePublisherSlug,
                        type: "articles",
                        slug: article.slug,
                        label: article.title,
                      })
                }
                label="Copy wikilink"
              />
              {isEditor && (
                <Link
                  /* `?book=` disambiguates: two books may hold a section with
                     this slug, so the bare slug is not enough to edit by. */
                  href={`/${articlePublisherSlug}/articles/${article.slug}/edit${
                    article.isInternal ? `?book=${encodeURIComponent(bookSlug)}` : ""
                  }`}
                  className="themed-nav-link hover:text-[var(--foreground)] transition-colors"
                  style={{ fontSize: "0.8125rem" }}
                >
                  Edit
                </Link>
              )}
            </div>
          </div>

          {/* Section title */}
          <div className="py-8 sm:py-11">
            <h1
              className="article-title-serif"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", lineHeight: 1.15 }}
            >
              {article.title}
            </h1>
            {articlePublisherSlug !== publisherSlug && (
              <p className="themed-muted mt-3" style={{ fontSize: "0.875rem" }}>
                Originally by{" "}
                <Link href={`/${articlePublisherSlug}`} className="themed-link">
                  @{articlePublisherSlug}
                </Link>
              </p>
            )}
          </div>

        </div>
      </div>

      {/* ── Prose ────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <ArticleToc entries={toc} />
        <ArticleBody
          source={renderedBody}
          rawSource={article.content ?? ""}
          publisherSlug={publisherSlug}
          cites={{ slugToNumber, resolved: resolvedCitations }}
          macros={katexMacros}
          showDetails={isEditor}
        />
      </div>

      {/* ── Page-turn navigation ─────────────────────────────────── */}
      {(prevSlug || nextSlug) && (
        <div className="max-w-3xl mx-auto px-5 pb-16 sm:pb-20">
          <nav
            className="flex items-center justify-between pt-8"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {prevSlug ? (
              <Link
                href={sectionHref(publisherSlug, bookSlug, prevSlug)}
                className="group flex items-center gap-2 themed-nav-link hover:text-[var(--foreground)] transition-colors"
                style={{ fontSize: "0.875rem" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:-translate-x-0.5"
                  aria-hidden="true"
                >
                  <path d="M19 12H5m7-7-7 7 7 7" />
                </svg>
                Previous
              </Link>
            ) : (
              <span />
            )}
            {nextSlug ? (
              <Link
                href={sectionHref(publisherSlug, bookSlug, nextSlug)}
                className="group flex items-center gap-2 themed-nav-link hover:text-[var(--foreground)] transition-colors"
                style={{ fontSize: "0.875rem" }}
              >
                Next
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m-7-7 7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
      )}

      {/* ── Section discussion ───────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-5 pb-16 sm:pb-20">
        <CommentThread
          publisherSlug={articlePublisherSlug}
          subject={{ kind: "article", slug: article.slug }}
          subjectId={{ articleId: article.id }}
          ownerType={articleOwnerType}
          ownerId={articleOwnerId}
          session={session}
        />
      </div>

    </main>
    <ArticleSectionRail entries={toc} />
    </>
  );
}
