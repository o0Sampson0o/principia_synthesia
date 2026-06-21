import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { articles, books, objects, orgMemberships, events } from "@/db/schema";
import { eq, and, desc, isNull, lt, sql } from "drizzle-orm";
import { filterVisible } from "@/lib/access";
import MarkVerifiedForm from "@/components/MarkVerifiedForm";

const STALE_DAYS = Number(process.env.STALE_ARTICLE_DAYS ?? "180");

export default async function PublisherProfilePage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await getSession();
  const isOwner =
    session?.isRootAdmin ||
    (pub.kind === "user" && session?.userSlug === publisherSlug) ||
    (pub.kind === "org" && session
      ? (
          await db
            .select({ id: orgMemberships.id })
            .from(orgMemberships)
            .where(
              and(
                eq(orgMemberships.orgId, pub.orgId!),
                eq(orgMemberships.userId, session.userId)
              )
            )
            .limit(1)
        ).length > 0
      : false);

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [allBooks, allArticles, allObjects, recentEvents] = await Promise.all([
    db
      .select({ id: books.id, slug: books.slug, title: books.title })
      .from(books)
      .where(and(eq(books.ownerType, ownerType), eq(books.ownerId, ownerId))),
    db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        isInternal: articles.isInternal,
      })
      .from(articles)
      .where(
        and(
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId),
          eq(articles.isInternal, false),
          isNull(articles.deletedAt)
        )
      ),
    db
      .select({ id: objects.id, slug: objects.slug, name: objects.name, type: objects.type })
      .from(objects)
      .where(and(eq(objects.ownerType, ownerType), eq(objects.ownerId, ownerId))),
    db
      .select({ id: events.id, slug: events.slug, title: events.title, eventDate: events.eventDate })
      .from(events)
      .where(and(eq(events.ownerType, ownerType), eq(events.ownerId, ownerId)))
      .orderBy(desc(events.eventDate))
      .limit(5),
  ]);

  // Stale articles (only for the owner, for the sidebar nudge)
  let staleArticles: Array<{ id: number; slug: string; title: string }> = [];
  if (isOwner) {
    staleArticles = await db
      .select({ id: articles.id, slug: articles.slug, title: articles.title })
      .from(articles)
      .where(
        and(
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId),
          eq(articles.isInternal, false),
          sql`${articles.metadata}->>'status' = 'published'`,
          lt(
            articles.lastVerifiedAt,
            sql`NOW() - (${STALE_DAYS}::int * INTERVAL '1 day')`
          ),
          isNull(articles.deletedAt)
        )
      );
  }

  // Filter private resources for non-owner sessions.
  // Owners (including org members with edit rights and root admin) see everything.
  let visibleBooks = allBooks;
  let visibleArticles = allArticles;
  let visibleObjects = allObjects;
  let visibleEvents = recentEvents;

  if (!isOwner) {
    const bookRefs = allBooks.map((b) => ({ type: "book" as const, ownerType, ownerId, slug: b.slug }));
    const articleRefs = allArticles.map((a) => ({ type: "article" as const, ownerType, ownerId, slug: a.slug }));
    const objectRefs = allObjects.map((o) => ({ type: "object" as const, ownerType, ownerId, slug: o.slug }));
    const eventRefs = recentEvents.map((e) => ({ type: "event" as const, ownerType, ownerId, slug: e.slug }));

    const [visBookRefs, visArticleRefs, visObjectRefs, visEventRefs] = await Promise.all([
      filterVisible(bookRefs, session),
      filterVisible(articleRefs, session),
      filterVisible(objectRefs, session),
      filterVisible(eventRefs, session),
    ]);

    const visBookSlugs = new Set(visBookRefs.map((r) => r.slug));
    const visArticleSlugs = new Set(visArticleRefs.map((r) => r.slug));
    const visObjectSlugs = new Set(visObjectRefs.map((r) => r.slug));
    const visEventSlugs = new Set(visEventRefs.map((r) => r.slug));

    visibleBooks = allBooks.filter((b) => visBookSlugs.has(b.slug));
    visibleArticles = allArticles.filter((a) => visArticleSlugs.has(a.slug));
    visibleObjects = allObjects.filter((o) => visObjectSlugs.has(o.slug));
    visibleEvents = recentEvents.filter((e) => visEventSlugs.has(e.slug));
  }

  const hasContent =
    visibleArticles.length > 0 ||
    visibleBooks.length > 0 ||
    visibleObjects.length > 0 ||
    visibleEvents.length > 0;

  return (
    <main className="max-w-5xl mx-auto px-5 py-12 sm:py-16">

      {/* ── Profile header ────────────────────────────────────────────── */}
      <div className="flex items-start gap-5 mb-10">
        <div className="ps-pub-avatar">
          {pub.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h1
              className="ps-display"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}
            >
              {pub.displayName}
            </h1>
            {pub.kind === "org" && (
              <span
                className="themed-badge"
                style={{ fontSize: "0.6875rem", padding: "0.2rem 0.5rem" }}
              >
                Organization
              </span>
            )}
          </div>
          <p className="themed-muted mb-4" style={{ fontSize: "0.875rem" }}>
            @{pub.slug}
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            {visibleArticles.length > 0 && (
              <span className="ps-stat">
                <strong>{visibleArticles.length}</strong>
                {visibleArticles.length === 1 ? " article" : " articles"}
              </span>
            )}
            {visibleBooks.length > 0 && (
              <span className="ps-stat">
                <strong>{visibleBooks.length}</strong>
                {visibleBooks.length === 1 ? " book" : " books"}
              </span>
            )}
            {visibleEvents.length > 0 && (
              <span className="ps-stat">
                <strong>{visibleEvents.length}</strong>
                {visibleEvents.length === 1 ? " event" : " events"}
              </span>
            )}
            {visibleObjects.length > 0 && (
              <span className="ps-stat">
                <strong>{visibleObjects.length}</strong>
                {visibleObjects.length === 1 ? " object" : " objects"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Owner action bar ──────────────────────────────────────────── */}
      {isOwner && (
        <div className="ps-action-bar mb-8">
          <Link
            href={`/${publisherSlug}/articles/new`}
            data-tour="new-article-button"
            className="themed-btn-accent rounded-md"
            style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem" }}
          >
            + Article
          </Link>
          <Link
            href={`/${publisherSlug}/books/new`}
            className="themed-btn-accent rounded-md"
            style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem" }}
          >
            + Book
          </Link>
          <Link
            href={`/${publisherSlug}/objects/new`}
            className="themed-btn-accent rounded-md"
            style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem" }}
          >
            + Object
          </Link>
          <Link
            href={`/${publisherSlug}/events/new`}
            className="themed-btn-accent rounded-md"
            style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem" }}
          >
            + Event
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href={`/${publisherSlug}/analytics`}
              className="themed-btn-outline"
              style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}
            >
              Analytics
            </Link>
            <Link
              href={`/${publisherSlug}/images`}
              className="themed-btn-outline"
              style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}
            >
              Images
            </Link>
            <Link
              href={`/${publisherSlug}/bin`}
              className="themed-btn-outline"
              style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}
            >
              Bin
            </Link>
            {pub.kind === "org" && (
              <Link
                href={`/${publisherSlug}/members`}
                className="themed-btn-outline"
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}
              >
                Members
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Section anchor nav ────────────────────────────────────────── */}
      {hasContent && (
        <div className="flex gap-5 border-b themed-border mb-10 overflow-x-auto scrollbar-none">
          {visibleArticles.length > 0 && (
            <a href="#articles" className="ps-tab" data-active="true">
              Articles
              <span className="themed-muted" style={{ fontSize: "0.75rem" }}>({visibleArticles.length})</span>
            </a>
          )}
          {visibleBooks.length > 0 && (
            <a href="#books" className="ps-tab">
              Books
              <span className="themed-muted" style={{ fontSize: "0.75rem" }}>({visibleBooks.length})</span>
            </a>
          )}
          {visibleObjects.length > 0 && (
            <a href="#objects" className="ps-tab">
              Objects
              <span className="themed-muted" style={{ fontSize: "0.75rem" }}>({visibleObjects.length})</span>
            </a>
          )}
          {visibleEvents.length > 0 && (
            <a href="#events" className="ps-tab">
              Events
              <span className="themed-muted" style={{ fontSize: "0.75rem" }}>({visibleEvents.length})</span>
            </a>
          )}
        </div>
      )}

      <div className="space-y-12">

        {/* ── Articles ─────────────────────────────────────────────────── */}
        {visibleArticles.length > 0 && (
          <section id="articles">
            <p className="ps-eyebrow mb-5">Articles</p>
            <div className="ps-content-box">
              {visibleArticles.map((a) => (
                <div key={a.id} className="ps-content-row">
                  <Link
                    href={`/${publisherSlug}/articles/${a.slug}`}
                    className="ps-list-link flex-1 min-w-0"
                    style={{ fontSize: "1rem" }}
                  >
                    {a.title}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Books ────────────────────────────────────────────────────── */}
        {visibleBooks.length > 0 && (
          <section id="books">
            <p className="ps-eyebrow mb-5">Books</p>
            <div className="ps-content-box">
              {visibleBooks.map((b) => (
                <div key={b.id} className="ps-content-row">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 themed-muted" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <Link href={`/${publisherSlug}/books/${b.slug}`} className="ps-list-link flex-1 min-w-0">
                    {b.title}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Objects ──────────────────────────────────────────────────── */}
        {visibleObjects.length > 0 && (
          <section id="objects">
            <p className="ps-eyebrow mb-5">Objects</p>
            <div className="ps-content-box">
              {visibleObjects.map((o) => (
                <div key={o.id} className="ps-content-row">
                  <Link href={`/${publisherSlug}/objects/${o.slug}`} className="ps-list-link flex-1 min-w-0">
                    {o.name}
                  </Link>
                  <span className="themed-badge capitalize shrink-0">{o.type}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Events ───────────────────────────────────────────────────── */}
        {visibleEvents.length > 0 && (
          <section id="events">
            <div className="flex items-center justify-between mb-5">
              <p className="ps-eyebrow">Events</p>
              <Link
                href={`/${publisherSlug}/events`}
                className="themed-nav-link flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                style={{ fontSize: "0.75rem" }}
              >
                View all
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14m-7-7 7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="ps-content-box">
              {visibleEvents.map((e) => (
                <div key={e.id} className="ps-content-row">
                  <Link href={`/${publisherSlug}/events/${e.slug}`} className="ps-list-link flex-1 min-w-0">
                    {e.title}
                  </Link>
                  <span className="themed-muted shrink-0" style={{ fontSize: "0.75rem" }}>
                    {new Date(e.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Stale articles (owner only) ──────────────────────────────── */}
        {isOwner && staleArticles.length > 0 && (
          <section>
            <p className="ps-eyebrow mb-2">Needs review</p>
            <p className="themed-muted mb-5" style={{ fontSize: "0.875rem" }}>
              These published articles haven&apos;t been verified in over {Math.round(STALE_DAYS / 30)} months.
            </p>
            <div className="ps-content-box">
              {staleArticles.map((a) => (
                <div key={a.id} className="ps-content-row flex-wrap">
                  <Link href={`/${publisherSlug}/articles/${a.slug}`} className="ps-list-link flex-1 min-w-0">
                    {a.title}
                  </Link>
                  <MarkVerifiedForm publisherSlug={publisherSlug} articleId={a.id} />
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
