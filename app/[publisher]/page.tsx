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

  return (
    <main className="max-w-5xl mx-auto px-5 py-10 sm:py-14">

      {/* ── Profile header ── */}
      <div className="flex items-start gap-4 mb-8 flex-wrap">
        <div className="publisher-avatar text-xl">
          {pub.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h1
              className="text-2xl sm:text-3xl themed-heading"
              style={{ fontWeight: 600, letterSpacing: "-0.03em" }}
            >
              {pub.displayName}
            </h1>
            {pub.kind === "org" && (
              <span className="themed-badge text-xs">Organization</span>
            )}
          </div>
          <p className="text-sm themed-muted mb-3">@{pub.slug}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="stat-chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/></svg>
              <strong className="themed-heading" style={{ fontWeight: 600 }}>{visibleArticles.length}</strong> articles
            </span>
            <span className="stat-chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <strong className="themed-heading" style={{ fontWeight: 600 }}>{visibleBooks.length}</strong> books
            </span>
            <span className="stat-chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
              <strong className="themed-heading" style={{ fontWeight: 600 }}>{visibleEvents.length}</strong> events
            </span>
          </div>
        </div>
      </div>

      {/* ── Owner action bar ── */}
      {isOwner && (
        <div className="flex flex-wrap gap-2 mb-8 p-3 rounded-xl themed-surface border themed-border">
          <Link href={`/${publisherSlug}/articles/new`} data-tour="new-article-button" className="themed-btn-accent text-sm px-3 py-1.5 rounded-md">
            + Article
          </Link>
          <Link href={`/${publisherSlug}/books/new`} className="themed-btn-accent text-sm px-3 py-1.5 rounded-md">
            + Book
          </Link>
          <Link href={`/${publisherSlug}/objects/new`} className="themed-btn-accent text-sm px-3 py-1.5 rounded-md">
            + Object
          </Link>
          <Link href={`/${publisherSlug}/events/new`} className="themed-btn-accent text-sm px-3 py-1.5 rounded-md">
            + Event
          </Link>
          <div className="ml-auto flex gap-2">
            <Link href={`/${publisherSlug}/images`} className="themed-btn-outline text-sm px-3 py-1.5">
              Images
            </Link>
            <Link href={`/${publisherSlug}/bin`} className="themed-btn-outline text-sm px-3 py-1.5">
              Bin
            </Link>
            {pub.kind === "org" && (
              <Link href={`/${publisherSlug}/members`} className="themed-btn-outline text-sm px-3 py-1.5">
                Members
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Section anchor nav ── */}
      <div className="flex gap-1 border-b themed-border mb-8 overflow-x-auto scrollbar-none">
        {visibleArticles.length > 0 && (
          <a href="#articles" className="themed-tab pb-2.5 border-b-2 mb-[-1px]" style={{ borderBottomColor: "var(--accent)" }}>
            Articles
            <span className="themed-muted text-xs ml-1">({visibleArticles.length})</span>
          </a>
        )}
        {visibleBooks.length > 0 && (
          <a href="#books" className="themed-tab pb-2.5 border-b-2 border-transparent mb-[-1px]">
            Books
            <span className="themed-muted text-xs ml-1">({visibleBooks.length})</span>
          </a>
        )}
        {visibleObjects.length > 0 && (
          <a href="#objects" className="themed-tab pb-2.5 border-b-2 border-transparent mb-[-1px]">
            Objects
            <span className="themed-muted text-xs ml-1">({visibleObjects.length})</span>
          </a>
        )}
        {visibleEvents.length > 0 && (
          <a href="#events" className="themed-tab pb-2.5 border-b-2 border-transparent mb-[-1px]">
            Events
            <span className="themed-muted text-xs ml-1">({visibleEvents.length})</span>
          </a>
        )}
      </div>

      <div className="space-y-10">

        {/* ── Articles ── */}
        {visibleArticles.length > 0 && (
          <section id="articles">
            <p className="themed-section-label mb-4">Articles</p>
            <div className="themed-card overflow-hidden px-4">
              {visibleArticles.map((a) => (
                <div key={a.id} className="py-4 border-b themed-border last:border-b-0">
                  <Link
                    href={`/${publisherSlug}/articles/${a.slug}`}
                    className="article-title-serif text-base block"
                  >
                    {a.title}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Books ── */}
        {visibleBooks.length > 0 && (
          <section id="books">
            <p className="themed-section-label mb-4">Books</p>
            <div className="themed-card overflow-hidden px-4">
              {visibleBooks.map((b) => (
                <div key={b.id} className="py-4 border-b themed-border last:border-b-0 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--muted-foreground)" }} aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  <Link href={`/${publisherSlug}/books/${b.slug}`} className="themed-link font-medium text-sm">
                    {b.title}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Objects ── */}
        {visibleObjects.length > 0 && (
          <section id="objects">
            <p className="themed-section-label mb-4">Objects</p>
            <div className="themed-card overflow-hidden px-4">
              {visibleObjects.map((o) => (
                <div key={o.id} className="py-4 border-b themed-border last:border-b-0 flex items-center justify-between gap-3">
                  <Link href={`/${publisherSlug}/objects/${o.slug}`} className="themed-link text-sm">
                    {o.name}
                  </Link>
                  <span className="themed-badge capitalize">{o.type}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Events ── */}
        {visibleEvents.length > 0 && (
          <section id="events">
            <div className="flex items-center justify-between mb-4">
              <p className="themed-section-label">Events</p>
              <Link href={`/${publisherSlug}/events`} className="text-xs themed-nav-link flex items-center gap-1">
                View all
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="themed-card overflow-hidden px-4">
              {visibleEvents.map((e) => (
                <div key={e.id} className="py-4 border-b themed-border last:border-b-0 flex items-center justify-between gap-3">
                  <Link href={`/${publisherSlug}/events/${e.slug}`} className="themed-link text-sm">
                    {e.title}
                  </Link>
                  <span className="text-xs themed-muted shrink-0">
                    {new Date(e.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Stale articles (owner only) ── */}
        {isOwner && staleArticles.length > 0 && (
          <section>
            <p className="themed-section-label mb-2">Needs review</p>
            <p className="text-sm themed-muted mb-4">
              These published articles haven&apos;t been verified in over {Math.round(STALE_DAYS / 30)} months.
            </p>
            <div className="themed-card overflow-hidden px-4">
              {staleArticles.map((a) => (
                <div key={a.id} className="py-4 border-b themed-border last:border-b-0 flex flex-wrap items-center gap-3">
                  <Link href={`/${publisherSlug}/articles/${a.slug}`} className="themed-link text-sm flex-1 min-w-0">
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
