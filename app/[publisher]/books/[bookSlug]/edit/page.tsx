import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { books, curriculumEntries, articles, publishers, bookCategories, categories } from "@/db/schema";
import { eq, and, asc, isNull, or, sql, inArray } from "drizzle-orm";
import Link from "next/link";
import CategoryPicker from "@/components/CategoryPicker";
import {
  updateBook,
  deleteBook,
  upsertCurriculumEntry,
  removeCurriculumEntry,
  createInternalArticle,
  reorderChapters,
  addExternalArticle,
  promoteArticleToStandalone,
  absorbArticleIntoBook,
} from "../../actions";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}/books/${bookSlug}`);
  }

  const [bookRow] = await db
    .select()
    .from(books)
    .where(
      and(
        eq(books.slug, bookSlug),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNull(books.deletedAt)
      )
    )
    .limit(1);

  if (!bookRow) notFound();

  // Current categories
  const bookCats = await db
    .select({ slug: categories.slug })
    .from(bookCategories)
    .innerJoin(categories, eq(bookCategories.categoryId, categories.id))
    .where(eq(bookCategories.bookId, bookRow.id));

  // Current chapters
  const chapters = await db
    .select({
      entryId: curriculumEntries.id,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: articles.id,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      isInternal: articles.isInternal,
      articleOwnerType: articles.ownerType,
      articleOwnerId: articles.ownerId,
      articlePublisherSlug: publishers.slug,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .leftJoin(
      publishers,
      or(
        and(
          eq(articles.ownerType, sql`'user'`),
          eq(publishers.userId, articles.ownerId)
        ),
        and(
          eq(articles.ownerType, sql`'org'`),
          eq(publishers.orgId, articles.ownerId)
        )
      )
    )
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  // How many books each chapter's article belongs to. A same-publisher
  // standalone article can only be "absorbed" (made internal) when it lives in
  // exactly one book — this one — otherwise absorbing it would orphan it from
  // its other books.
  const chapterArticleIds = chapters.map((c) => c.articleId);
  const bookCounts =
    chapterArticleIds.length > 0
      ? await db
          .select({
            articleId: curriculumEntries.articleId,
            count: sql<number>`count(*)::int`,
          })
          .from(curriculumEntries)
          .where(inArray(curriculumEntries.articleId, chapterArticleIds))
          .groupBy(curriculumEntries.articleId)
      : [];
  const bookCountByArticle = new Map(
    bookCounts.map((r) => [r.articleId, r.count])
  );

  // Articles available to add (non-internal, non-deleted, owned by this publisher)
  const availableArticles = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        eq(articles.isInternal, false),
        isNull(articles.deletedAt)
      )
    )
    .orderBy(asc(articles.title));

  async function action(formData: FormData): Promise<void> {
    "use server";
    await updateBook(publisherSlug, formData);
  }

  async function addChapter(formData: FormData): Promise<void> {
    "use server";
    await upsertCurriculumEntry(publisherSlug, formData);
  }

  async function removeChapter(formData: FormData): Promise<void> {
    "use server";
    await removeCurriculumEntry(publisherSlug, formData);
  }

  async function newInternalArticle(formData: FormData): Promise<void> {
    "use server";
    await createInternalArticle(publisherSlug, formData);
  }

  async function reorder(formData: FormData): Promise<void> {
    "use server";
    await reorderChapters(publisherSlug, formData);
  }

  async function addExternal(formData: FormData): Promise<void> {
    "use server";
    await addExternalArticle(publisherSlug, formData);
  }

  async function makeStandalone(formData: FormData): Promise<void> {
    "use server";
    await promoteArticleToStandalone(publisherSlug, formData);
  }

  async function absorb(formData: FormData): Promise<void> {
    "use server";
    await absorbArticleIntoBook(publisherSlug, formData);
  }

  return (
    <main className="w-full max-w-4xl mx-auto px-5 py-10 sm:py-14">
      <div className="flex items-end justify-between mb-8 gap-4">
        <div>
          <p className="ps-eyebrow mb-1.5">Book</p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Edit book</h1>
        </div>
        <Link
          href={`/${publisherSlug}/books/${bookSlug}/access`}
          className="themed-btn-outline shrink-0"
          style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
        >
          Access &amp; visibility
        </Link>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={bookRow.id} />
        <div>
          <label htmlFor="title" className="block text-sm font-medium themed-secondary mb-1">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            defaultValue={bookRow.title}
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            defaultValue={bookRow.slug}
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="summary" className="block text-sm font-medium themed-secondary mb-1">
            Summary
          </label>
          <textarea
            id="summary"
            name="summary"
            rows={3}
            maxLength={500}
            defaultValue={bookRow.summary ?? ""}
            placeholder="Brief overview of this book..."
            className="themed-input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium themed-secondary mb-1">
            Tags
          </label>
          <CategoryPicker initialSelected={bookCats.map(c => c.slug)} />
        </div>
        <button type="submit" className="themed-btn-accent rounded-lg">
          Save changes
        </button>
      </form>

      <section className="mt-10 border-t pt-8">
        <h2 className="text-xl font-semibold themed-heading mb-4">Chapters</h2>

        {chapters.length === 0 ? (
          <p className="text-sm themed-muted mb-6">No chapters yet.</p>
        ) : (
          <ol className="space-y-2 mb-6">
            {chapters.map((ch, idx) => {
              const entryIds = chapters.map((c) => c.entryId);
              const swapUp =
                idx > 0
                  ? [
                      ...entryIds.slice(0, idx - 1),
                      entryIds[idx],
                      entryIds[idx - 1],
                      ...entryIds.slice(idx + 1),
                    ]
                  : entryIds;
              const swapDown =
                idx < chapters.length - 1
                  ? [
                      ...entryIds.slice(0, idx),
                      entryIds[idx + 1],
                      entryIds[idx],
                      ...entryIds.slice(idx + 2),
                    ]
                  : entryIds;

              const isExternal =
                ch.articlePublisherSlug !== null &&
                ch.articlePublisherSlug !== publisherSlug;

              return (
                <li
                  key={ch.entryId}
                  className={`flex items-center gap-2 p-3 border rounded themed-surface ${
                    isExternal ? "border-l-4 border-l-blue-500" : ""
                  }`}
                >
                  <span className="text-sm themed-muted w-6 shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    {ch.partTitle && (
                      <span className="text-xs themed-muted block">{ch.partTitle}</span>
                    )}
                    <span className="text-sm font-medium themed-heading truncate block">
                      {ch.articleTitle}
                    </span>
                    <span className="text-xs themed-muted">{ch.articleSlug}</span>
                    {ch.isInternal && (
                      <span className="ml-2 themed-badge">
                        internal
                      </span>
                    )}
                    {isExternal && (
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 rounded themed-tag"
                        title={`Borrowed from @${ch.articlePublisherSlug}`}
                      >
                        external &middot; By{" "}
                        <Link
                          href={`/${ch.articlePublisherSlug}`}
                          className="themed-link"
                        >
                          @{ch.articlePublisherSlug}
                        </Link>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ch.isInternal && (
                      <form action={makeStandalone}>
                        <input type="hidden" name="articleId" value={ch.articleId} />
                        <button
                          type="submit"
                          className="themed-btn-ghost text-xs px-2 py-1"
                          title="Make this a standalone article. It stays a chapter here but also gets its own public URL and appears in listings, search and the sitemap. It will no longer be deleted along with the book."
                        >
                          Make standalone
                        </button>
                      </form>
                    )}
                    {!ch.isInternal &&
                      !isExternal &&
                      (bookCountByArticle.get(ch.articleId) ?? 1) === 1 && (
                        <form action={absorb}>
                          <input type="hidden" name="articleId" value={ch.articleId} />
                          <input type="hidden" name="bookId" value={bookRow.id} />
                          <button
                            type="submit"
                            className="themed-btn-ghost text-xs px-2 py-1"
                            title="Make this article internal to this book. It will be removed from your standalone article list, search and the sitemap, its public /articles URL will stop working, and it will be deleted if this book is deleted."
                          >
                            Make internal
                          </button>
                        </form>
                      )}
                    {!ch.isInternal &&
                      !isExternal &&
                      (bookCountByArticle.get(ch.articleId) ?? 1) > 1 && (
                        <span
                          className="text-xs themed-muted px-2 py-1"
                          title="This article is used in other books. Remove it from those books first to make it internal to this one."
                        >
                          in {bookCountByArticle.get(ch.articleId)} books
                        </span>
                      )}
                    {idx > 0 && (
                      <form action={reorder}>
                        <input type="hidden" name="bookId" value={bookRow.id} />
                        <input
                          type="hidden"
                          name="orderedIds"
                          value={JSON.stringify(swapUp)}
                        />
                        <button type="submit" className="themed-btn-ghost text-xs px-2 py-1">
                          ↑
                        </button>
                      </form>
                    )}
                    {idx < chapters.length - 1 && (
                      <form action={reorder}>
                        <input type="hidden" name="bookId" value={bookRow.id} />
                        <input
                          type="hidden"
                          name="orderedIds"
                          value={JSON.stringify(swapDown)}
                        />
                        <button type="submit" className="themed-btn-ghost text-xs px-2 py-1">
                          ↓
                        </button>
                      </form>
                    )}
                    {isExternal ? (
                      <form action={removeChapter}>
                        <input type="hidden" name="id" value={ch.entryId} />
                        <input type="hidden" name="bookId" value={bookRow.id} />
                        <button
                          type="submit"
                          className="themed-btn-ghost text-xs px-2 py-1 text-blue-500"
                          title="Remove from this book (the original article is not affected)"
                        >
                          Unlink
                        </button>
                      </form>
                    ) : (
                      <form action={removeChapter}>
                        <input type="hidden" name="id" value={ch.entryId} />
                        <input type="hidden" name="bookId" value={bookRow.id} />
                        <button
                          type="submit"
                          className="themed-btn-ghost text-xs px-2 py-1 text-red-500"
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Add existing article */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold themed-secondary mb-3">Add existing article</h3>
            <form action={addChapter} className="space-y-2">
              <input type="hidden" name="bookId" value={bookRow.id} />
              <input type="hidden" name="position" value={chapters.length} />
              <select name="articleId" required className="themed-input text-sm">
                <option value="">Select an article…</option>
                {availableArticles
                  .filter((a) => !chapters.some((c) => c.articleId === a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.slug})
                    </option>
                  ))}
              </select>
              <input
                name="partTitle"
                type="text"
                placeholder="Part title (optional)"
                className="themed-input text-sm"
              />
              <button type="submit" className="themed-btn-accent rounded text-sm">
                Add chapter
              </button>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-semibold themed-secondary mb-3">
              Create internal chapter
            </h3>
            <form action={newInternalArticle} className="space-y-2">
              <input type="hidden" name="bookId" value={bookRow.id} />
              <input type="hidden" name="position" value={chapters.length} />
              <input
                name="title"
                type="text"
                required
                placeholder="Chapter title"
                maxLength={200}
                className="themed-input text-sm"
              />
              <input
                name="slug"
                type="text"
                required
                placeholder="article-my-chapter"
                pattern="^article-[a-z0-9]+(?:-[a-z0-9]+)*$"
                title="Must start with 'article-' followed by lowercase letters, numbers, and hyphens"
                className="themed-input text-sm"
              />
              <p className="text-xs themed-muted">Must start with &ldquo;article-&rdquo; (e.g. article-intro).</p>
              <input
                name="partTitle"
                type="text"
                placeholder="Part title (optional)"
                className="themed-input text-sm"
              />
              <button type="submit" className="themed-btn-accent rounded text-sm">
                Create chapter
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold themed-secondary mb-3">
            Add external article
          </h3>
          <p className="text-xs themed-muted mb-3">
            Borrow an article authored by another publisher. The article must be
            visible to your account (public, or you must have an access grant).
            Original authorship is preserved.
          </p>
          <form action={addExternal} className="space-y-2">
            <input type="hidden" name="bookId" value={bookRow.id} />
            <input type="hidden" name="position" value={chapters.length} />
            <input
              name="targetPublisher"
              type="text"
              required
              placeholder="publisher-slug"
              className="themed-input text-sm"
            />
            <input
              name="articleSlug"
              type="text"
              required
              placeholder="article-my-chapter"
              pattern="^article-[a-z0-9]+(?:-[a-z0-9]+)*$"
              title="Article slug, e.g. article-intro"
              className="themed-input text-sm"
            />
            <input
              name="partTitle"
              type="text"
              placeholder="Part title (optional)"
              className="themed-input text-sm"
            />
            <button type="submit" className="themed-btn-accent rounded text-sm">
              Add external chapter
            </button>
          </form>
        </div>
      </section>

      <section className="mt-12 border-t border-red-200 pt-8">
        <h2 className="text-lg font-semibold text-red-600 mb-2">Danger zone</h2>
        <p className="text-sm themed-muted mb-4">
          Deleting a book moves it to the bin for 30 days, then it is permanently removed
          along with its curriculum entries and internal articles.
        </p>
        <form action={deleteBook.bind(null, publisherSlug)}>
          <input type="hidden" name="bookId" value={bookRow.id} />
          <button type="submit" className="themed-btn-ghost text-red-600 hover:bg-red-50">
            Delete book
          </button>
        </form>
      </section>
    </main>
  );
}
