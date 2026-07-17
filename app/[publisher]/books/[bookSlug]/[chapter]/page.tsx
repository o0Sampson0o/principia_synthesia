import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, articles, curriculumEntries, articleViews, publishers } from "@/db/schema";
import { eq, and, asc, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkQuoteAttribution } from "@/lib/remark-quote-attribution";
import DynamicAnimation from "@/components/DynamicAnimation";
import ArticleImage from "@/components/ArticleImage";
import MdxParagraph from "@/components/MdxParagraph";
import Cite from "@/components/Cite";
import { parseFrontmatter } from "@/lib/frontmatter";
import { buildCitationIndex } from "@/lib/mdx-cite-numbering";
import { remarkCiteNumbering, type ResolvedCitation } from "@/lib/remark-cite-numbering";
import { headers } from "next/headers";
import { classifyReferrer } from "@/lib/analytics-source";
import { getOrCreateSessionId } from "@/lib/analytics-session";
import { config } from "@/lib/config";
import CommentThread from "@/components/CommentThread";
import MdH1 from "@/components/MdH1";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string; chapter: string }>;
}) {
  const { publisher: publisherSlug, bookSlug, chapter: chapterSlug } = await params;

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

  const [entryRow] = await db
    .select({ article: articles })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(and(eq(curriculumEntries.bookId, bookRow.id), eq(articles.slug, chapterSlug)))
    .limit(1);

  const article = entryRow?.article;
  if (!article) notFound();

  if (article.isInternal && article.parentBookId !== bookRow.id) notFound();

  {
    const siteHost = new URL(config.siteUrl).host;
    const [hdrs, sessionId] = await Promise.all([
      headers(),
      getOrCreateSessionId(),
    ]);
    const referrer = hdrs.get("referer");
    db.insert(articleViews).values({
      articleId: article.id,
      referrer: referrer?.slice(0, 2000) ?? null,
      referrerSource: classifyReferrer(referrer, siteHost),
      sessionId,
    }).catch(() => {});
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

  const allEntries = await db
    .select({ articleSlug: articles.slug, position: curriculumEntries.position })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  const currentIdx = allEntries.findIndex((e) => e.articleSlug === chapterSlug);
  const prevSlug = currentIdx > 0 ? allEntries[currentIdx - 1].articleSlug : null;
  const nextSlug = currentIdx < allEntries.length - 1 ? allEntries[currentIdx + 1].articleSlug : null;

  const { metadata, body } = parseFrontmatter(article.content ?? "");

  const { slugToNumber, orderedSlugs } = buildCitationIndex(body);
  const resolvedCitations = new Map<string, ResolvedCitation>();
  if (orderedSlugs.length > 0) {
    for (const citeSlug of orderedSlugs) {
      const slashIdx = citeSlug.indexOf("/");
      if (slashIdx === -1) continue;
      const citePublisherSlug = citeSlug.slice(0, slashIdx);
      const citeArticleSlug = citeSlug.slice(slashIdx + 1);
      const [citePubRow] = await db
        .select({ kind: publishers.kind, userId: publishers.userId, orgId: publishers.orgId })
        .from(publishers)
        .where(eq(publishers.slug, citePublisherSlug))
        .limit(1);
      if (!citePubRow) continue;
      const citeOwnerId = citePubRow.kind === "user" ? citePubRow.userId : citePubRow.orgId;
      if (citeOwnerId === null) continue;
      const [citeArticleRow] = await db
        .select({ title: articles.title })
        .from(articles)
        .where(
          and(
            eq(articles.ownerType, citePubRow.kind),
            eq(articles.ownerId, citeOwnerId),
            eq(articles.slug, citeArticleSlug),
            isNull(articles.deletedAt)
          )
        )
        .limit(1);
      if (!citeArticleRow) continue;
      resolvedCitations.set(citeSlug, {
        title: citeArticleRow.title,
        href: `${config.siteUrl}/${citePublisherSlug}/articles/${citeArticleSlug}`,
      });
    }
  }

  const safeCanvas =
    metadata.canvas && /^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.canvas)
      ? metadata.canvas
      : null;
  const renderedBody = safeCanvas
    ? `<DynamicAnimation publisher="${publisherSlug}" slug="${safeCanvas}" />\n\n${body}`
    : body;

  return (
    <main className="flex-1">

      {/* ── Framed chapter header ────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-3xl mx-auto px-5">

          {/* Breadcrumb + edit row */}
          <div
            className="flex items-center justify-between py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <Link
                href={`/${publisherSlug}`}
                className="ps-eyebrow hover:opacity-70 transition-opacity"
              >
                @{publisherSlug}
              </Link>
              <span className="themed-muted" style={{ fontSize: "0.625rem" }}>/</span>
              <Link
                href={`/${publisherSlug}/books/${bookSlug}`}
                className="themed-muted hover:text-[var(--foreground)] transition-colors truncate"
                style={{ fontSize: "0.6875rem" }}
              >
                {bookRow.title}
              </Link>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {currentIdx >= 0 && (
                <span
                  className="themed-muted hidden sm:block"
                  style={{
                    fontSize: "0.5625rem",
                    fontFamily: "ui-monospace, monospace",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {currentIdx + 1} / {allEntries.length}
                </span>
              )}
              {isEditor && (
                <Link
                  href={`/${articlePublisherSlug}/articles/${chapterSlug}/edit`}
                  className="themed-nav-link hover:text-[var(--foreground)] transition-colors"
                  style={{ fontSize: "0.8125rem" }}
                >
                  Edit
                </Link>
              )}
            </div>
          </div>

          {/* Chapter title */}
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
        <div className="markdown-content">
          <MDXRemote
            source={renderedBody}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkMath, remarkGfm, remarkCallouts, remarkQuoteAttribution, remarkWikilinks, [remarkCiteNumbering, { slugToNumber, resolved: resolvedCitations }]],
                rehypePlugins: [rehypeKatex],
              },
            }}
            components={{ DynamicAnimation, img: ArticleImage, p: MdxParagraph, Cite, h1: MdH1 }}
          />
        </div>
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
                href={`/${publisherSlug}/books/${bookSlug}/${prevSlug}`}
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
                href={`/${publisherSlug}/books/${bookSlug}/${nextSlug}`}
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

      {/* ── Chapter discussion ───────────────────────────────────── */}
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
  );
}
