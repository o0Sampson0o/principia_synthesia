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
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!bookRow) notFound();

  const session = await getSession();
  if (!(await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session))) notFound();

  // Find the article via its curriculum entry — this handles articles owned by
  // a different publisher than the book (cross-publisher curriculum entries).
  const [entryRow] = await db
    .select({ article: articles })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .where(and(eq(curriculumEntries.bookId, bookRow.id), eq(articles.slug, chapterSlug)))
    .limit(1);

  const article = entryRow?.article;
  if (!article) notFound();

  // Internal article: must belong to this book
  if (article.isInternal && article.parentBookId !== bookRow.id) notFound();

  // Record view with referrer + anonymous session ID (fire-and-forget; ignore errors)
  {
    const siteHost = new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://principia-synthesia.com"
    ).host;
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

  // Resolve the article's own publisher slug — it may differ from the book's
  // publisher when a cross-publisher article is added to the curriculum.
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

  // Get all entries for prev/next navigation
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
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://principia-synthesia.com";
      resolvedCitations.set(citeSlug, {
        title: citeArticleRow.title,
        href: `${siteUrl}/${citePublisherSlug}/articles/${citeArticleSlug}`,
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
    <main className="max-w-3xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-6 flex items-center gap-1.5 flex-wrap" style={{ fontSize: "0.8125rem" }}>
        <Link href={`/${publisherSlug}`} className="ps-eyebrow">@{publisherSlug}</Link>
        <span className="themed-muted">/</span>
        <Link href={`/${publisherSlug}/books/${bookSlug}`} className="ps-eyebrow">{bookRow.title}</Link>
      </div>

      <h1 className="ps-display themed-heading mb-3" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>{article.title}</h1>

      {articlePublisherSlug !== publisherSlug && (
        <p className="themed-muted mb-6" style={{ fontSize: "0.875rem" }}>
          Originally by{" "}
          <Link href={`/${articlePublisherSlug}`} className="themed-link">
            @{articlePublisherSlug}
          </Link>
        </p>
      )}
      {articlePublisherSlug === publisherSlug && <div className="mb-6" />}

      {isEditor && (
        <div className="mb-6">
          <Link
            href={`/${articlePublisherSlug}/articles/${chapterSlug}/edit`}
            className="themed-nav-link hover:text-[var(--foreground)] transition-colors"
            style={{ fontSize: "0.8125rem" }}
          >
            Edit chapter
          </Link>
        </div>
      )}

      <div className="markdown-content">
        <MDXRemote
          source={renderedBody}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks, [remarkCiteNumbering, { slugToNumber, resolved: resolvedCitations }]],
              rehypePlugins: [rehypeKatex],
            },
          }}
          components={{ DynamicAnimation, img: ArticleImage, p: MdxParagraph, Cite }}
        />
      </div>

      <nav className="flex justify-between mt-14 pt-6 border-t themed-border" style={{ fontSize: "0.875rem" }}>
        {prevSlug ? (
          <Link href={`/${publisherSlug}/books/${bookSlug}/${prevSlug}`} className="themed-nav-link hover:text-[var(--foreground)] transition-colors inline-flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
            Previous
          </Link>
        ) : (
          <span />
        )}
        {nextSlug && (
          <Link href={`/${publisherSlug}/books/${bookSlug}/${nextSlug}`} className="themed-nav-link hover:text-[var(--foreground)] transition-colors">
            Next →
          </Link>
        )}
      </nav>
    </main>
  );
}
