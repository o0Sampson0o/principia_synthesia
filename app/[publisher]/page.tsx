import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { articles, books, objects, orgMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [allBooks, allArticles, allObjects] = await Promise.all([
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
  ]);

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
        {allBooks.length === 0 ? (
          <p className="themed-muted text-sm">No books yet.</p>
        ) : (
          <ul className="space-y-2">
            {allBooks.map((b) => (
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
        {allArticles.length === 0 ? (
          <p className="themed-muted text-sm">No articles yet.</p>
        ) : (
          <ul className="space-y-2">
            {allArticles.map((a) => (
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
      <section>
        <h2 className="text-xl font-semibold themed-heading mb-4">Objects</h2>
        {allObjects.length === 0 ? (
          <p className="themed-muted text-sm">No objects yet.</p>
        ) : (
          <ul className="space-y-2">
            {allObjects.map((o) => (
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
    </main>
  );
}
