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
      .where(and(eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt))),
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
    <main className="flex-1">

      {/* ── Author header — framed like a journal byline ────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-end gap-6 py-12 sm:py-16">

            {/* Left: name + meta */}
            <div>
              <p className="ps-eyebrow mb-5">
                {pub.kind === "org" ? "Organization" : "Publisher"}
              </p>
              <div className="flex items-start gap-3 flex-wrap mb-3">
                <h1
                  className="ps-display themed-heading"
                  style={{ fontSize: "clamp(2.25rem, 5vw, 3.75rem)" }}
                >
                  {pub.displayName}
                </h1>
                {pub.kind === "org" && (
                  <span
                    className="themed-badge mt-2"
                    style={{ fontSize: "0.6875rem", padding: "0.2rem 0.5rem" }}
                  >
                    Organization
                  </span>
                )}
              </div>
              <p
                className="themed-muted mb-6"
                style={{
                  fontSize: "0.8125rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.04em",
                }}
              >
                @{pub.slug}
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                {visibleArticles.length > 0 && (
                  <span className="ps-stat">
                    <strong>{visibleArticles.length}</strong>
                    {" "}{visibleArticles.length === 1 ? "article" : "articles"}
                  </span>
                )}
                {visibleBooks.length > 0 && (
                  <span className="ps-stat">
                    <strong>{visibleBooks.length}</strong>
                    {" "}{visibleBooks.length === 1 ? "book" : "books"}
                  </span>
                )}
                {visibleEvents.length > 0 && (
                  <span className="ps-stat">
                    <strong>{visibleEvents.length}</strong>
                    {" "}{visibleEvents.length === 1 ? "event" : "events"}
                  </span>
                )}
                {visibleObjects.length > 0 && (
                  <span className="ps-stat">
                    <strong>{visibleObjects.length}</strong>
                    {" "}{visibleObjects.length === 1 ? "object" : "objects"}
                  </span>
                )}
              </div>
            </div>

            {/* Right: large decorative initial — typographic ornament */}
            <div
              className="hidden sm:flex items-center justify-center shrink-0 select-none"
              style={{
                width: "7rem",
                height: "7rem",
                borderRadius: "0.75rem",
                background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
                border: "1px solid color-mix(in srgb, var(--accent) 20%, var(--border))",
                fontFamily: "var(--font-playfair)",
                fontSize: "3.5rem",
                fontWeight: 500,
                color: "var(--accent)",
                lineHeight: 1,
              }}
              aria-hidden="true"
            >
              {pub.displayName.charAt(0).toUpperCase()}
            </div>

          </div>
        </div>
      </div>

      {/* ── Owner controls ───────────────────────────────────────────── */}
      {isOwner && (
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/${publisherSlug}/articles/new`}
              data-tour="new-article-button"
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
            >
              + Article
            </Link>
            <Link
              href={`/${publisherSlug}/books/new`}
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
            >
              + Book
            </Link>
            <Link
              href={`/${publisherSlug}/objects/new`}
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
            >
              + Object
            </Link>
            <Link
              href={`/${publisherSlug}/events/new`}
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
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
        </div>
      )}

      {/* ── Publication index ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-10 sm:py-14">

        {/* Section tab nav */}
        {hasContent && (
          <div className="flex gap-5 border-b themed-border mb-10 overflow-x-auto scrollbar-none">
            {visibleArticles.length > 0 && (
              <a href="#articles" className="ps-tab" data-active="true">
                Articles
                <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
                  ({visibleArticles.length})
                </span>
              </a>
            )}
            {visibleBooks.length > 0 && (
              <a href="#books" className="ps-tab">
                Books
                <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
                  ({visibleBooks.length})
                </span>
              </a>
            )}
            {visibleObjects.length > 0 && (
              <a href="#objects" className="ps-tab">
                Objects
                <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
                  ({visibleObjects.length})
                </span>
              </a>
            )}
            {visibleEvents.length > 0 && (
              <a href="#events" className="ps-tab">
                Events
                <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
                  ({visibleEvents.length})
                </span>
              </a>
            )}
          </div>
        )}

        <div className="space-y-14">

          {/* ── Articles ─────────────────────────────────────────────── */}
          {visibleArticles.length > 0 && (
            <section id="articles">
              <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
                <p className="ps-eyebrow-muted">Articles</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {visibleArticles.length}
                </span>
              </div>
              {visibleArticles.map((a) => (
                <div
                  key={a.id}
                  className="group py-4 border-b themed-border last:border-b-0"
                >
                  <Link
                    href={`/${publisherSlug}/articles/${a.slug}`}
                    className="article-title-serif group-hover:text-[var(--accent)] transition-colors block"
                    style={{ fontSize: "1.0625rem" }}
                  >
                    {a.title}
                  </Link>
                </div>
              ))}
            </section>
          )}

          {/* ── Books ────────────────────────────────────────────────── */}
          {visibleBooks.length > 0 && (
            <section id="books">
              <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
                <p className="ps-eyebrow-muted">Books</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {visibleBooks.length}
                </span>
              </div>
              {visibleBooks.map((b) => (
                <div
                  key={b.id}
                  className="group flex items-center gap-3 py-4 border-b themed-border last:border-b-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 themed-muted"
                    aria-hidden="true"
                  >
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <Link
                    href={`/${publisherSlug}/books/${b.slug}`}
                    className="ps-list-link group-hover:text-[var(--accent)] transition-colors"
                  >
                    {b.title}
                  </Link>
                </div>
              ))}
            </section>
          )}

          {/* ── Objects ──────────────────────────────────────────────── */}
          {visibleObjects.length > 0 && (
            <section id="objects">
              <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
                <p className="ps-eyebrow-muted">Objects</p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {visibleObjects.length}
                </span>
              </div>
              {visibleObjects.map((o) => (
                <div
                  key={o.id}
                  className="group flex items-center justify-between gap-6 py-4 border-b themed-border last:border-b-0"
                >
                  <Link
                    href={`/${publisherSlug}/objects/${o.slug}`}
                    className="ps-list-link group-hover:text-[var(--accent)] transition-colors min-w-0 flex-1"
                  >
                    {o.name}
                  </Link>
                  <span className="themed-badge capitalize shrink-0">{o.type}</span>
                </div>
              ))}
            </section>
          )}

          {/* ── Events ───────────────────────────────────────────────── */}
          {visibleEvents.length > 0 && (
            <section id="events">
              <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
                <p className="ps-eyebrow-muted">Events</p>
                <Link
                  href={`/${publisherSlug}/events`}
                  className="themed-nav-link hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
                  style={{ fontSize: "0.75rem" }}
                >
                  View all
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14m-7-7 7 7-7 7" />
                  </svg>
                </Link>
              </div>
              {visibleEvents.map((e) => (
                <div
                  key={e.id}
                  className="group flex items-center justify-between gap-6 py-4 border-b themed-border last:border-b-0"
                >
                  <Link
                    href={`/${publisherSlug}/events/${e.slug}`}
                    className="ps-list-link group-hover:text-[var(--accent)] transition-colors min-w-0 flex-1"
                  >
                    {e.title}
                  </Link>
                  <span
                    className="themed-muted shrink-0 tabular-nums"
                    style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                  >
                    {new Date(e.eventDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </section>
          )}

          {/* ── Stale articles (owner only) ──────────────────────────── */}
          {isOwner && staleArticles.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b mb-1" style={{ borderColor: "var(--color-warning-border)" }}>
                <p
                  className="ps-eyebrow-muted"
                  style={{ color: "var(--color-warning-text)" }}
                >
                  Needs review
                </p>
                <span
                  className="themed-muted"
                  style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
                >
                  {staleArticles.length}
                </span>
              </div>
              <p className="themed-muted mb-1" style={{ fontSize: "0.8125rem" }}>
                These published articles haven&apos;t been verified in over{" "}
                {Math.round(STALE_DAYS / 30)} months.
              </p>
              {staleArticles.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-4 py-4 border-b themed-border last:border-b-0 flex-wrap"
                >
                  <Link
                    href={`/${publisherSlug}/articles/${a.slug}`}
                    className="ps-list-link min-w-0 flex-1"
                  >
                    {a.title}
                  </Link>
                  <MarkVerifiedForm publisherSlug={publisherSlug} articleId={a.id} />
                </div>
              ))}
            </section>
          )}

          {/* ── Empty state ──────────────────────────────────────────── */}
          {!hasContent && (
            <div className="py-24 text-center">
              <p className="ps-eyebrow mb-3">Nothing published yet</p>
              {isOwner ? (
                <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
                  Start writing — create your first article above.
                </p>
              ) : (
                <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
                  This publisher hasn&apos;t shared anything publicly yet.
                </p>
              )}
            </div>
          )}

        </div>
      </div>

    </main>
  );
}
