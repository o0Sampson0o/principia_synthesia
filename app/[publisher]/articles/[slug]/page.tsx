import { db } from "@/db";
import { articles, categories, articleCategories, articleViews, publishers, users } from "@/db/schema";
import { eq, and, count, desc, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import DynamicAnimation from "@/components/DynamicAnimation";
import ArticleImage from "@/components/ArticleImage";
import MdxParagraph from "@/components/MdxParagraph";
import ArticleMetadataDisplay from "@/components/ArticleMetadata";
import { parseFrontmatter } from "@/lib/frontmatter";
import RelatedEvents from "@/components/RelatedEvents";
import LastVerifiedBadge from "@/components/LastVerifiedBadge";
import MarkVerifiedForm from "@/components/MarkVerifiedForm";
import SnapshotBanner from "@/components/SnapshotBanner";
import { getSnapshotByShortHash } from "@/lib/article-snapshots";
import CiteButton from "@/components/CiteButton";
import { classifyReferrer } from "@/lib/analytics-source";
import { getOrCreateSessionId } from "@/lib/analytics-session";
import ForkButton from "@/components/ForkButton";
import ForkLineageHeader from "@/components/ForkLineageHeader";
import ForksList from "@/components/ForksList";
import Cite from "@/components/Cite";
import BibliographySection from "@/components/BibliographySection";
import { buildCitationIndex } from "@/lib/mdx-cite-numbering";
import { remarkCiteNumbering, type ResolvedCitation } from "@/lib/remark-cite-numbering";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ publisher: string; slug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const [{ publisher: publisherSlug, slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const versionHash = resolvedSearchParams.v;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [session, articleRows] = await Promise.all([
    getSession(),
    db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.slug, slug),
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId),
          isNull(articles.deletedAt)
        )
      )
      .limit(1),
  ]);

  if (!articleRows[0]) notFound();
  const article = articleRows[0];

  // Internal articles are not accessible via the /articles/ route
  if (article.isInternal) notFound();

  if (!(await canView({ type: "article", ownerType, ownerId, slug }, session))) notFound();

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

  const isEditor = await canEditContent(session, ownerType as "user" | "org", ownerId);

  // Snapshot resolution (when ?v= is present)
  let viewingSnapshot: { shortHash: string; publishedAt: Date } | null = null;
  let displayTitle = article.title;
  let displaySummary = article.summary;
  let displayContent = article.content;

  if (versionHash) {
    const snapshot = await getSnapshotByShortHash(article.id, versionHash);
    if (!snapshot) notFound();
    viewingSnapshot = { shortHash: snapshot.shortHash, publishedAt: snapshot.publishedAt };
    displayTitle = snapshot.title;
    displaySummary = snapshot.summary;
    displayContent = snapshot.content;
  }

  const articleCats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(articleCategories, eq(categories.id, articleCategories.categoryId))
    .where(eq(articleCategories.articleId, article.id));

  const { title, summary, content, createdAt, updatedAt } = {
    title: displayTitle,
    summary: displaySummary,
    content: displayContent,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
  const { metadata, body } = parseFrontmatter(content ?? "");

  // Citation input computation
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://principia-synthesia.com";
  const canonicalUrl = `${siteUrl}/${publisherSlug}/articles/${slug}${versionHash ? `?v=${versionHash}` : ""}`;
  const citationPublishedAt = viewingSnapshot ? viewingSnapshot.publishedAt : (article.updatedAt ?? article.createdAt ?? new Date());

  // Staleness computation (server-side, not reactive)
  const STALE_DAYS = Number(process.env.STALE_ARTICLE_DAYS ?? "180");
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const lastVerifiedAt = article.lastVerifiedAt ?? null;
  const isStale =
    !viewingSnapshot &&
    metadata.status === "published" &&
    lastVerifiedAt !== null &&
    new Date().getTime() - new Date(lastVerifiedAt).getTime() > STALE_DAYS * MS_PER_DAY;
  const staleMonths = Math.round(STALE_DAYS / 30);

  // Fork lineage: resolve source article if this article is a fork
  let forkSource: {
    title: string;
    publisherSlug: string;
    authorDisplayName: string;
    articleSlug: string;
  } | null = null;

  if (article.forkedFromId) {
    const [sourceRow] = await db
      .select({
        title: articles.title,
        slug: articles.slug,
        ownerType: articles.ownerType,
        ownerId: articles.ownerId,
      })
      .from(articles)
      .where(and(eq(articles.id, article.forkedFromId), isNull(articles.deletedAt)))
      .limit(1);

    if (sourceRow) {
      // Resolve source publisher slug and display name
      const [sourcePubRow] = await db
        .select({
          slug: publishers.slug,
          userDisplayName: users.displayName,
        })
        .from(publishers)
        .leftJoin(users, eq(publishers.userId, users.id))
        .where(
          sourceRow.ownerType === "user"
            ? eq(publishers.userId, sourceRow.ownerId)
            : eq(publishers.orgId, sourceRow.ownerId)
        )
        .limit(1);

      if (sourcePubRow) {
        forkSource = {
          title: sourceRow.title,
          publisherSlug: sourcePubRow.slug,
          authorDisplayName: sourcePubRow.userDisplayName ?? sourcePubRow.slug,
          articleSlug: sourceRow.slug,
        };
      }
    }
  }

  // Forks list: articles that forked from this article
  const FORKS_LIMIT = 10;
  const [forksCountRow, forksRows] = await Promise.all([
    db
      .select({ total: count(articles.id) })
      .from(articles)
      .where(and(eq(articles.forkedFromId, article.id), isNull(articles.deletedAt))),
    db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        ownerType: articles.ownerType,
        ownerId: articles.ownerId,
      })
      .from(articles)
      .where(and(eq(articles.forkedFromId, article.id), isNull(articles.deletedAt)))
      .orderBy(desc(articles.createdAt))
      .limit(FORKS_LIMIT),
  ]);
  const forksCount = Number(forksCountRow[0]?.total ?? 0);

  // Resolve publisher slugs for forks — batch join via publishers + users
  const forksWithPublisher: Array<{
    id: number;
    slug: string;
    title: string;
    publisherSlug: string;
    authorDisplayName: string;
  }> = [];

  for (const fork of forksRows) {
    const [forkPubRow] = await db
      .select({ slug: publishers.slug, userDisplayName: users.displayName })
      .from(publishers)
      .leftJoin(users, eq(publishers.userId, users.id))
      .where(
        fork.ownerType === "user"
          ? eq(publishers.userId, fork.ownerId)
          : eq(publishers.orgId, fork.ownerId)
      )
      .limit(1);
    if (forkPubRow) {
      forksWithPublisher.push({
        id: fork.id,
        slug: fork.slug,
        title: fork.title,
        publisherSlug: forkPubRow.slug,
        authorDisplayName: forkPubRow.userDisplayName ?? forkPubRow.slug,
      });
    }
  }

  // Build citation index for <Cite> components in the article body
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

      const citeOwnerType = citePubRow.kind;
      const citeOwnerId = citeOwnerType === "user" ? citePubRow.userId : citePubRow.orgId;
      if (citeOwnerId === null) continue;

      const [citeArticleRow] = await db
        .select({ id: articles.id, title: articles.title })
        .from(articles)
        .where(
          and(
            eq(articles.ownerType, citeOwnerType),
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

  // Auto-prepend canvas animation if set
  const safeCanvas =
    metadata.canvas && /^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.canvas)
      ? metadata.canvas
      : null;
  const renderedBody = safeCanvas
    ? `<DynamicAnimation publisher="${publisherSlug}" slug="${safeCanvas}" />\n\n${body}`
    : body;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {viewingSnapshot && (
        <SnapshotBanner
          publisherSlug={publisherSlug}
          slug={slug}
          shortHash={viewingSnapshot.shortHash}
          publishedAt={viewingSnapshot.publishedAt}
        />
      )}

      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight themed-heading mb-3">{title}</h1>
        {summary && (
          <p className="text-lg themed-muted mb-4 leading-relaxed">{summary}</p>
        )}
        <div className="flex items-center gap-4 text-xs themed-muted flex-wrap">
          {createdAt && (
            <span>
              Created{" "}
              {createdAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
          {updatedAt && updatedAt.getTime() !== createdAt?.getTime() && (
            <>
              <span className="opacity-30">·</span>
              <span>
                Updated{" "}
                {updatedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          )}
          {isEditor && !viewingSnapshot && (
            <>
              <span className="opacity-30">·</span>
              <Link
                href={`/${publisherSlug}/articles/${slug}/edit`}
                className="themed-link underline underline-offset-2"
              >
                Edit
              </Link>
              <span className="opacity-30">·</span>
              <Link
                href={`/${publisherSlug}/articles/${slug}/versions`}
                className="themed-link underline underline-offset-2"
              >
                Versions
              </Link>
              <span className="opacity-30">·</span>
              <MarkVerifiedForm publisherSlug={publisherSlug} articleId={article.id} />
            </>
          )}
          <span className="opacity-30">·</span>
          <CiteButton
            authorDisplayName={pub.displayName}
            authorPublisherSlug={publisherSlug}
            title={title}
            publishedAt={citationPublishedAt}
            url={canonicalUrl}
            versionHash={versionHash ?? null}
          />
          {!viewingSnapshot && (
            <>
              <span className="opacity-30">·</span>
              <ForkButton
                sourcePublisherSlug={publisherSlug}
                sourceArticleSlug={slug}
                isAuthenticated={!!session}
              />
            </>
          )}
          {!viewingSnapshot && (
            <LastVerifiedBadge
              lastVerifiedAt={lastVerifiedAt}
              isPublished={metadata.status === "published"}
              isStale={isStale}
              staleMonths={staleMonths}
            />
          )}
        </div>
        <ArticleMetadataDisplay
          metadata={metadata}
          categories={articleCats}
          publisherSlug={publisherSlug}
        />
      </header>

      {forkSource && (
        <ForkLineageHeader
          originalTitle={forkSource.title}
          originalAuthorDisplayName={forkSource.authorDisplayName}
          originalPublisherSlug={forkSource.publisherSlug}
          originalArticleSlug={forkSource.articleSlug}
        />
      )}

      <div className="markdown-content">
        <MDXRemote
          source={renderedBody}
          options={{
            mdxOptions: {
              remarkPlugins: [
                remarkMath,
                remarkGfm,
                remarkWikilinks,
                [remarkCiteNumbering, { slugToNumber, resolved: resolvedCitations }],
              ],
              rehypePlugins: [rehypeKatex],
            },
          }}
          components={{ DynamicAnimation, img: ArticleImage, p: MdxParagraph, Cite }}
        />
      </div>

      <BibliographySection orderedSlugs={orderedSlugs} resolved={resolvedCitations} />

      <RelatedEvents articleId={article.id} />

      <ForksList forks={forksWithPublisher} totalCount={forksCount} />


    </main>
  );
}
