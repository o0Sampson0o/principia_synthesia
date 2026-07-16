import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { books, bookCategories, categories, curriculumEntries } from "@/db/schema";
import { eq, and, isNull, isNotNull, inArray, desc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { filterVisible } from "@/lib/access";

const MONO = "ui-monospace, monospace";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PublisherBooksPage({
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

  const rawBooks = await db
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
      summary: books.summary,
      metadata: books.metadata,
      createdAt: books.createdAt,
      updatedAt: books.updatedAt,
    })
    .from(books)
    .where(
      and(
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNull(books.deletedAt)
      )
    )
    .orderBy(desc(books.updatedAt));

  let visible = rawBooks;
  if (!isOwner) {
    const refs = rawBooks.map((b) => ({ type: "book" as const, ownerType, ownerId, slug: b.slug }));
    const visRefs = await filterVisible(refs, session);
    const visSlugs = new Set(visRefs.map((r) => r.slug));
    visible = rawBooks.filter((b) => visSlugs.has(b.slug));
  }

  const ids = visible.map((b) => b.id);

  // Categories for the visible set, grouped by book.
  const catRows = ids.length
    ? await db
        .select({
          bookId: bookCategories.bookId,
          name: categories.name,
          slug: categories.slug,
        })
        .from(bookCategories)
        .innerJoin(categories, eq(categories.id, bookCategories.categoryId))
        .where(inArray(bookCategories.bookId, ids))
    : [];

  const catsByBook = new Map<number, { name: string; slug: string }[]>();
  for (const r of catRows) {
    const list = catsByBook.get(r.bookId) ?? [];
    list.push({ name: r.name, slug: r.slug });
    catsByBook.set(r.bookId, list);
  }

  // Chapter counts (part dividers carry no article and don't count).
  const countRows = ids.length
    ? await db
        .select({
          bookId: curriculumEntries.bookId,
          count: sql<number>`count(*)::int`,
        })
        .from(curriculumEntries)
        .where(and(inArray(curriculumEntries.bookId, ids), isNotNull(curriculumEntries.articleId)))
        .groupBy(curriculumEntries.bookId)
    : [];
  const chaptersByBook = new Map(countRows.map((r) => [r.bookId, r.count]));

  const items = visible.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    summary: b.summary || b.metadata?.description || "",
    status: b.metadata?.status ?? "published",
    tags: b.metadata?.tags ?? [],
    categories: catsByBook.get(b.id) ?? [],
    chapters: chaptersByBook.get(b.id) ?? 0,
    updatedAt: b.updatedAt,
  }));

  const count = items.length;

  return (
    <main className="w-full max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
      {/* Masthead header */}
      <header className="mb-10 sm:mb-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="ps-eyebrow mb-2">Books</p>
            <h1
              className="ps-display themed-heading"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", lineHeight: 1.05 }}
            >
              {pub.displayName}
            </h1>
          </div>
          {isOwner && (
            <Link
              href={`/${publisherSlug}/books/new`}
              className="themed-btn-accent rounded-lg shrink-0"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
            >
              + New book
            </Link>
          )}
        </div>

        <div className="flex items-baseline justify-between border-t themed-border mt-6 pt-3">
          <span className="ps-eyebrow-muted">Index</span>
          <span
            className="themed-muted"
            style={{ fontSize: "0.625rem", fontFamily: MONO, letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {count === 1 ? "1 volume" : `${count} volumes`}
          </span>
        </div>
      </header>

      {count === 0 ? (
        <div className="border-t themed-border pt-20 pb-10 text-center">
          <p className="ps-display themed-muted" style={{ fontSize: "1.375rem" }}>
            No books yet.
          </p>
          {isOwner && (
            <p className="themed-muted mt-2" style={{ fontSize: "0.875rem" }}>
              Start your first volume to begin the collection.
            </p>
          )}
        </div>
      ) : (
        <div className="border-t themed-border">
          {items.map((b) => (
            <Link
              key={b.id}
              href={`/${publisherSlug}/books/${b.slug}`}
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
                      {b.categories.length > 0
                        ? b.categories.map((c) => c.name).join(" · ")
                        : "Uncategorized"}
                    </span>
                    {isOwner && b.status !== "published" && (
                      <span className="themed-badge" style={{ textTransform: "uppercase" }}>
                        {b.status}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2
                    className="ps-display themed-heading group-hover:[color:var(--accent)] transition-colors"
                    style={{ fontSize: "clamp(1.125rem, 2vw, 1.375rem)", lineHeight: 1.18 }}
                  >
                    {b.title}
                  </h2>

                  {/* Summary excerpt */}
                  {b.summary && (
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
                      {b.summary}
                    </p>
                  )}

                  {/* Footer metadata */}
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3">
                    <span
                      className="themed-muted"
                      style={{
                        fontSize: "0.625rem",
                        fontFamily: MONO,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {b.chapters === 1 ? "1 chapter" : `${b.chapters} chapters`}
                    </span>
                    {b.updatedAt && (
                      <span
                        className="themed-muted"
                        style={{
                          fontSize: "0.625rem",
                          fontFamily: MONO,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Updated {fmtDate(b.updatedAt)}
                      </span>
                    )}
                    {b.tags.length > 0 && (
                      <span className="flex items-center flex-wrap gap-x-2 gap-y-1">
                        {b.tags.slice(0, 4).map((t) => (
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
