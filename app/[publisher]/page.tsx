import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { articles, books, objects, orgMemberships, events } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { filterVisible } from "@/lib/access";

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
          eq(articles.isInternal, false)
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
    <main className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold themed-heading">{pub.displayName}</h1>
        <p className="text-sm themed-muted mt-1">@{pub.slug}</p>
        {pub.kind === "org" && (
          <p className="text-sm themed-muted mt-1">Organization</p>
        )}
      </div>

      {/* Action buttons for owner */}
      {isOwner && (
        <div className="flex gap-3 mb-10">
          <Link href={`/${publisherSlug}/articles/new`} className="themed-btn-primary text-sm px-4 py-2">
            New article
          </Link>
          <Link href={`/${publisherSlug}/books/new`} className="themed-btn-primary text-sm px-4 py-2">
            New book
          </Link>
          <Link href={`/${publisherSlug}/objects/new`} className="themed-btn-primary text-sm px-4 py-2">
            New object
          </Link>
          <Link href={`/${publisherSlug}/events/new`} className="themed-btn-primary text-sm px-4 py-2">
            New event
          </Link>
          <Link href={`/${publisherSlug}/images`} className="themed-btn-ghost text-sm px-4 py-2">
            Images
          </Link>
          {pub.kind === "org" && (
            <Link href={`/${publisherSlug}/members`} className="themed-btn-ghost text-sm px-4 py-2">
              Members
            </Link>
          )}
        </div>
      )}

      {/* Books */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold themed-heading mb-4">Books</h2>
        {visibleBooks.length === 0 ? (
          <p className="themed-muted text-sm">No books yet.</p>
        ) : (
          <ul className="space-y-2">
            {visibleBooks.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/${publisherSlug}/books/${b.slug}`}
                  className="themed-link font-medium"
                >
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Articles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold themed-heading mb-4">Articles</h2>
        {visibleArticles.length === 0 ? (
          <p className="themed-muted text-sm">No articles yet.</p>
        ) : (
          <ul className="space-y-2">
            {visibleArticles.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${publisherSlug}/articles/${a.slug}`}
                  className="themed-link"
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Objects */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold themed-heading mb-4">Objects</h2>
        {visibleObjects.length === 0 ? (
          <p className="themed-muted text-sm">No objects yet.</p>
        ) : (
          <ul className="space-y-2">
            {visibleObjects.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/${publisherSlug}/objects/${o.slug}`}
                  className="themed-link"
                >
                  {o.name}{" "}
                  <span className="text-xs themed-muted">({o.type})</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Events */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold themed-heading">Events</h2>
          <Link href={`/${publisherSlug}/events`} className="text-sm themed-link">
            View all events →
          </Link>
        </div>
        {visibleEvents.length === 0 ? (
          <p className="themed-muted text-sm">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {visibleEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <Link
                  href={`/${publisherSlug}/events/${e.slug}`}
                  className="themed-link"
                >
                  {e.title}
                </Link>
                <span className="text-xs themed-muted">
                  {new Date(e.eventDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
