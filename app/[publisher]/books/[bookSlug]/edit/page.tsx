import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { books, curriculumEntries, articles, publishers } from "@/db/schema";
import { eq, and, asc, or, sql } from "drizzle-orm";
import Link from "next/link";
import {
  updateBook,
  deleteBook,
  upsertCurriculumEntry,
  removeCurriculumEntry,
  createInternalArticle,
  reorderChapters,
  addExternalArticle,
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
        eq(books.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!bookRow) notFound();

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

  // Articles available to add (non-internal, owned by this publisher)
  const availableArticles = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        eq(articles.isInternal, false)
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

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold themed-heading">Edit book</h1>
        <Link
          href={`/${publisherSlug}/books/${bookSlug}/access`}
          className="themed-btn-ghost text-sm px-3 py-1"
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
        <button type="submit" className="themed-btn-primary">
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
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 themed-muted">
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
              <button type="submit" className="themed-btn-primary text-sm">
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
              <button type="submit" className="themed-btn-primary text-sm">
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
            <button type="submit" className="themed-btn-primary text-sm">
              Add external chapter
            </button>
          </form>
        </div>
      </section>

      <section className="mt-12 border-t border-red-200 pt-8">
        <h2 className="text-lg font-semibold text-red-600 mb-2">Danger zone</h2>
        <p className="text-sm themed-muted mb-4">
          Deleting a book is permanent and cannot be undone. All curriculum entries and internal
          articles will be removed.
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
