import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { articles, articleCategories, categories } from "@/db/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { filterVisible } from "@/lib/access";

const MONO = "ui-monospace, monospace";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PublisherArticlesPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  const isOwner = await canEditContent(session, ownerType, ownerId);

  const rawArticles = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      metadata: articles.metadata,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        eq(articles.isInternal, false),
        isNull(articles.deletedAt)
      )
    )
    .orderBy(desc(articles.updatedAt));

  let visible = rawArticles;
  if (!isOwner) {
    const refs = rawArticles.map((a) => ({ type: "article" as const, ownerType, ownerId, slug: a.slug }));
    const visRefs = await filterVisible(refs, session);
    const visSlugs = new Set(visRefs.map((r) => r.slug));
    visible = rawArticles.filter((a) => visSlugs.has(a.slug));
  }

  // Categories for the visible set, grouped by article.
  const ids = visible.map((a) => a.id);
  const catRows = ids.length
    ? await db
        .select({
          articleId: articleCategories.articleId,
          name: categories.name,
          slug: categories.slug,
        })
        .from(articleCategories)
        .innerJoin(categories, eq(categories.id, articleCategories.categoryId))
        .where(inArray(articleCategories.articleId, ids))
    : [];

  const catsByArticle = new Map<number, { name: string; slug: string }[]>();
  for (const r of catRows) {
    const list = catsByArticle.get(r.articleId) ?? [];
    list.push({ name: r.name, slug: r.slug });
    catsByArticle.set(r.articleId, list);
  }

  const items = visible.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    summary: a.summary || a.metadata?.description || "",
    status: a.metadata?.status ?? "published",
    tags: a.metadata?.tags ?? [],
    categories: catsByArticle.get(a.id) ?? [],
    updatedAt: a.updatedAt,
  }));

  const count = items.length;

  return (
    <main className="w-full max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
      {/* Masthead header */}
      <header className="mb-10 sm:mb-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="ps-eyebrow mb-2">Articles</p>
            <h1
              className="ps-display themed-heading"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", lineHeight: 1.05 }}
            >
              {pub.displayName}
            </h1>
          </div>
          {isOwner && (
            <Link
              href={`/${publisherSlug}/articles/new`}
              className="themed-btn-accent rounded-lg shrink-0"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
            >
              + New article
            </Link>
          )}
        </div>

        <div className="flex items-baseline justify-between border-t themed-border mt-6 pt-3">
          <span className="ps-eyebrow-muted">Index</span>
          <span
            className="themed-muted"
            style={{ fontSize: "0.625rem", fontFamily: MONO, letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {count === 1 ? "1 entry" : `${count} entries`}
          </span>
        </div>
      </header>

      {count === 0 ? (
        <div className="border-t themed-border pt-20 pb-10 text-center">
          <p className="ps-display themed-muted" style={{ fontSize: "1.375rem" }}>
            No articles yet.
          </p>
          {isOwner && (
            <p className="themed-muted mt-2" style={{ fontSize: "0.875rem" }}>
              Publish your first entry to begin the collection.
            </p>
          )}
        </div>
      ) : (
        <div className="border-t themed-border">
          {items.map((a) => (
            <Link
              key={a.id}
              href={`/${publisherSlug}/articles/${a.slug}`}
              className="group block border-b themed-border transition-colors hover:bg-[var(--surface)]"
              style={{ padding: "1.5rem 0.75rem" }}
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  {/* Eyebrow: categories + owner status badge */}
                  <div className="flex items-center gap-2.5 mb-2 min-h-[1rem]">
                    <span
                      className="themed-muted truncate"
                      style={{
                        fontSize: "0.625rem",
                        fontFamily: MONO,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {a.categories.length > 0
                        ? a.categories.map((c) => c.name).join(" · ")
                        : "Uncategorized"}
                    </span>
                    {isOwner && a.status !== "published" && (
                      <span className="themed-badge" style={{ textTransform: "uppercase" }}>
                        {a.status}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2
                    className="ps-display themed-heading group-hover:[color:var(--accent)] transition-colors"
                    style={{ fontSize: "clamp(1.125rem, 2vw, 1.375rem)", lineHeight: 1.18 }}
                  >
                    {a.title}
                  </h2>

                  {/* Summary excerpt */}
                  {a.summary && (
                    <p
                      className="themed-secondary mt-1.5"
                      style={{
                        fontSize: "0.9375rem",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {a.summary}
                    </p>
                  )}

                  {/* Footer metadata */}
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3">
                    {a.updatedAt && (
                      <span
                        className="themed-muted"
                        style={{
                          fontSize: "0.625rem",
                          fontFamily: MONO,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Updated {fmtDate(a.updatedAt)}
                      </span>
                    )}
                    {a.tags.length > 0 && (
                      <span className="flex items-center flex-wrap gap-x-2 gap-y-1">
                        {a.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="themed-muted"
                            style={{ fontSize: "0.6875rem", fontFamily: MONO }}
                          >
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hover affordance */}
                <span
                  aria-hidden="true"
                  className="opacity-0 group-hover:opacity-50 transition-opacity themed-muted shrink-0 self-center"
                >
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
