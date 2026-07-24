import { db } from "@/db";
import { formatDate } from "@/lib/format-date";
import { articles, categories, articleCategories, articleViews, publishers, users } from "@/db/schema";
import { eq, and, desc, isNull, or, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { config } from "@/lib/config";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import ArticleMetadataDisplay from "@/components/ArticleMetadata";
import {
  articleComponents,
  buildArticleMdxOptions,
  prepareArticleBody,
  resolveCitations,
} from "@/lib/article-mdx";
import RelatedEvents from "@/components/RelatedEvents";
import LastVerifiedBadge, { StaleWarningBanner } from "@/components/LastVerifiedBadge";
import MarkVerifiedForm from "@/components/MarkVerifiedForm";
import SnapshotBanner from "@/components/SnapshotBanner";
import { getSnapshotByShortHash } from "@/lib/article-snapshots";
import CiteButton from "@/components/CiteButton";
import { classifyReferrer } from "@/lib/analytics-source";
import { getOrCreateSessionId } from "@/lib/analytics-session";
import ForkButton from "@/components/ForkButton";
import ForkLineageHeader from "@/components/ForkLineageHeader";
import ForksList from "@/components/ForksList";
import BibliographySection from "@/components/BibliographySection";
import CommentThread from "@/components/CommentThread";
import MdxErrorBoundary from "@/components/MdxErrorBoundary";
import ArticleToc from "@/components/ArticleToc";
import ContinueReading from "@/components/ContinueReading";
import { extractToc } from "@/lib/article-toc";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publisher: string; slug: string }>;
}): Promise<Metadata> {
  const { publisher: publisherSlug, slug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) return {};
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [article] = await db
    .select({ title: articles.title, summary: articles.summary, isInternal: articles.isInternal })
    .from(articles)
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);
  if (!article || article.isInternal) return {};

  // Same visibility gate as the page — private articles stay untitled.
  const session = await getSession();
  if (!(await canView({ type: "article", ownerType, ownerId, slug }, session))) return {};

  const title = `${article.title} — ${pub.displayName}`;
  const description = article.summary ?? undefined;
  const url = `${config.siteUrl}/${publisherSlug}/articles/${slug}`;

  return {
    title: article.title,
    description,
    openGraph: { title, description, url, type: "article", siteName: "Principia Synthesia" },
    twitter: { card: "summary", title, description },
  };
}

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
  const { metadata, body, renderedBody } = prepareArticleBody(content ?? "", { publisherSlug });
  const toc = extractToc(body);

  // Citation input computation
  const canonicalUrl = `${config.siteUrl}/${publisherSlug}/articles/${slug}${versionHash ? `?v=${versionHash}` : ""}`;
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

  // Forks list: all articles forked from this one, with their publisher
  // resolved in the same query (previously an N+1 loop).
  const forksRows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      publisherSlug: publishers.slug,
      userDisplayName: users.displayName,
    })
    .from(articles)
    .leftJoin(
      publishers,
      or(
        and(eq(articles.ownerType, sql`'user'`), eq(publishers.userId, articles.ownerId)),
        and(eq(articles.ownerType, sql`'org'`), eq(publishers.orgId, articles.ownerId))
      )
    )
    .leftJoin(users, eq(publishers.userId, users.id))
    .where(and(eq(articles.forkedFromId, article.id), isNull(articles.deletedAt)))
    .orderBy(desc(articles.createdAt));

  const forksWithPublisher = forksRows
    .filter((f) => f.publisherSlug !== null)
    .map((f) => ({
      id: f.id,
      slug: f.slug,
      title: f.title,
      publisherSlug: f.publisherSlug!,
      authorDisplayName: f.userDisplayName ?? f.publisherSlug!,
    }));
  const forksCount = forksWithPublisher.length;

  // Build the <Cite> numbering index + resolve citations (two batched queries).
  const { slugToNumber, orderedSlugs, resolved: resolvedCitations } =
    await resolveCitations(body);

  return (
    <main className="w-full max-w-3xl mx-auto px-5 py-12 sm:py-16">
      {viewingSnapshot && (
        <SnapshotBanner
          publisherSlug={publisherSlug}
          slug={slug}
          shortHash={viewingSnapshot.shortHash}
          publishedAt={viewingSnapshot.publishedAt}
        />
      )}

      <header className="mb-10">
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href={`/${publisherSlug}`}
            className="ps-eyebrow inline-block hover:opacity-70 transition-opacity"
          >
            {pub.displayName}
          </Link>
        </nav>

        <h1
          className="ps-display themed-heading mb-5"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
        >
          {title}
        </h1>

        {summary && (
          <p
            className="themed-muted mb-6"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7 }}
          >
            {summary}
          </p>
        )}

        {/* Meta line — facts first (mono voice), then actions.
            Dot separators come from .ps-meta-item CSS. */}
        <div className="ps-meta-row">
          {viewingSnapshot ? (
            // A snapshot has one truthful date: when it was published.
            <span className="ps-meta-item themed-muted ps-mono-meta">
              {formatDate(viewingSnapshot.publishedAt)}
            </span>
          ) : (
            <>
              {createdAt && (
                <span className="ps-meta-item themed-muted ps-mono-meta">
                  {formatDate(createdAt)}
                </span>
              )}
              {updatedAt && updatedAt.getTime() !== createdAt?.getTime() && (
                <span className="ps-meta-item themed-muted ps-mono-meta">
                  updated {formatDate(updatedAt)}
                </span>
              )}
              <span className="ps-meta-item">
                <LastVerifiedBadge
                  lastVerifiedAt={lastVerifiedAt}
                  isPublished={metadata.status === "published"}
                />
              </span>
            </>
          )}
          <span className="ps-meta-item">
            <CiteButton
              authorDisplayName={pub.displayName}
              authorPublisherSlug={publisherSlug}
              title={title}
              publishedAt={citationPublishedAt}
              url={canonicalUrl}
              versionHash={versionHash ?? null}
            />
          </span>
          {!viewingSnapshot && (
            // div, not span: ForkButton renders a <form> (flow content)
            <div className="ps-meta-item">
              <ForkButton
                sourcePublisherSlug={publisherSlug}
                sourceArticleSlug={slug}
                isAuthenticated={!!session}
              />
            </div>
          )}
          {isEditor && !viewingSnapshot && (
            <>
              <span className="ps-meta-item">
                <Link href={`/${publisherSlug}/articles/${slug}/edit`} className="ps-quiet-action inline-block">
                  Edit
                </Link>
              </span>
              <span className="ps-meta-item">
                <Link href={`/${publisherSlug}/articles/${slug}/versions`} className="ps-quiet-action inline-block">
                  Versions
                </Link>
              </span>
              <div className="ps-meta-item">
                <MarkVerifiedForm publisherSlug={publisherSlug} articleId={article.id} />
              </div>
            </>
          )}
        </div>

        <ArticleMetadataDisplay
          metadata={metadata}
          categories={articleCats}
          publisherSlug={publisherSlug}
          renderedSummary={summary}
        />
      </header>

      {isStale && <StaleWarningBanner staleMonths={staleMonths} />}

      {forkSource && (
        <ForkLineageHeader
          originalTitle={forkSource.title}
          originalAuthorDisplayName={forkSource.authorDisplayName}
          originalPublisherSlug={forkSource.publisherSlug}
          originalArticleSlug={forkSource.articleSlug}
        />
      )}

      <ArticleToc entries={toc} />

      <MdxErrorBoundary showDetails={isEditor}>
      <div className="markdown-content">
        <MDXRemote
          source={renderedBody}
          options={buildArticleMdxOptions({ slugToNumber, resolved: resolvedCitations })}
          components={articleComponents}
        />
      </div>
      </MdxErrorBoundary>

      <BibliographySection orderedSlugs={orderedSlugs} resolved={resolvedCitations} />

      {/* Self-fetching sections stream in after the prose */}
      <Suspense fallback={null}>
        <RelatedEvents articleId={article.id} />
      </Suspense>

      <ForksList forks={forksWithPublisher} totalCount={forksCount} />

      {/* Post-article pathway — live corpus navigation, hidden on archived views */}
      {!viewingSnapshot && (
        <Suspense fallback={null}>
          <ContinueReading
            articleId={article.id}
            ownerType={ownerType as "user" | "org"}
            ownerId={ownerId}
            publisherSlug={publisherSlug}
            categoryIds={articleCats.map((c) => c.id)}
            session={session}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <CommentThread
          publisherSlug={publisherSlug}
          subject={{ kind: "article", slug }}
          subjectId={{ articleId: article.id }}
          ownerType={ownerType as "user" | "org"}
          ownerId={ownerId}
          session={session}
          readOnly={!!viewingSnapshot}
          liveHref={`/${publisherSlug}/articles/${slug}`}
        />
      </Suspense>

    </main>
  );
}
