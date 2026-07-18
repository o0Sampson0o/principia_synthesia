import { notFound, redirect } from "next/navigation";
import ToastForm from "@/components/ToastForm";
import ConfirmButton from "@/components/ConfirmButton";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { books, curriculumEntries, articles, publishers, bookCategories, categories } from "@/db/schema";
import { eq, and, asc, isNull, or, sql, inArray } from "drizzle-orm";
import Link from "next/link";
import CategoryPicker from "@/components/CategoryPicker";
import CurriculumList from "./CurriculumList";
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
  addPart,
  renamePart,
  addChapterDivider,
  renameChapterDivider,
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

  // Current sections (article-backed curriculum entries)
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

  // Standalone dividers (entries with no article): Part and Chapter labels.
  // Merged with sections into one position-ordered list so all three kinds
  // reorder through the same entryIds. Legacy rows (pre-0022) have a NULL
  // dividerLevel and are treated as parts.
  const dividers = await db
    .select({
      entryId: curriculumEntries.id,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      dividerLevel: curriculumEntries.dividerLevel,
    })
    .from(curriculumEntries)
    .where(and(eq(curriculumEntries.bookId, bookRow.id), isNull(curriculumEntries.articleId)))
    .orderBy(asc(curriculumEntries.position));

  const rows = [
    ...chapters.map((c) => ({ kind: "section" as const, entryId: c.entryId, position: c.position, chapter: c })),
    ...dividers.map((d) => ({
      kind: (d.dividerLevel === "chapter" ? "chapter" : "part") as "part" | "chapter",
      entryId: d.entryId,
      position: d.position,
      part: d,
    })),
  ].sort((a, b) => a.position - b.position);


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

  const listRows = rows.map((r) =>
    r.kind === "section"
      ? {
          kind: "section" as const,
          entryId: r.entryId,
          articleId: r.chapter.articleId,
          articleSlug: r.chapter.articleSlug,
          articleTitle: r.chapter.articleTitle,
          partTitle: r.chapter.partTitle,
          isInternal: r.chapter.isInternal,
          isExternal:
            r.chapter.articlePublisherSlug !== null &&
            r.chapter.articlePublisherSlug !== publisherSlug,
          articlePublisherSlug: r.chapter.articlePublisherSlug,
          booksCount: bookCountByArticle.get(r.chapter.articleId) ?? 1,
        }
      : { kind: r.kind, entryId: r.entryId, partTitle: r.part.partTitle }
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

  async function action(formData: FormData) {
    "use server";
    return updateBook(publisherSlug, formData);
  }

  async function addChapter(formData: FormData): Promise<void> {
    "use server";
    await upsertCurriculumEntry(publisherSlug, formData);
  }

  async function removeChapter(formData: FormData): Promise<void> {
    "use server";
    await removeCurriculumEntry(publisherSlug, formData);
  }

  async function newInternalArticle(formData: FormData) {
    "use server";
    return createInternalArticle(publisherSlug, formData);
  }

  async function reorder(formData: FormData): Promise<void> {
    "use server";
    await reorderChapters(publisherSlug, formData);
  }

  async function addExternal(formData: FormData) {
    "use server";
    return addExternalArticle(publisherSlug, formData);
  }

  async function makeStandalone(formData: FormData): Promise<void> {
    "use server";
    await promoteArticleToStandalone(publisherSlug, formData);
  }

  async function addPartAction(formData: FormData): Promise<void> {
    "use server";
    await addPart(publisherSlug, formData);
  }

  async function renamePartAction(formData: FormData): Promise<void> {
    "use server";
    await renamePart(publisherSlug, formData);
  }

  async function addChapterDividerAction(formData: FormData): Promise<void> {
    "use server";
    await addChapterDivider(publisherSlug, formData);
  }

  async function renameChapterDividerAction(formData: FormData): Promise<void> {
    "use server";
    await renameChapterDivider(publisherSlug, formData);
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
      <ToastForm action={action} className="space-y-4">
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
      </ToastForm>

      <section className="mt-10 border-t themed-border pt-8">
        <h2 className="text-xl font-semibold themed-heading mb-4">Sections</h2>

        <CurriculumList
          key={listRows.map((r) => r.entryId).join("-")}
          bookId={bookRow.id}
          rows={listRows}
          reorder={reorder}
          removeEntry={removeChapter}
          renamePart={renamePartAction}
          renameChapterDivider={renameChapterDividerAction}
          makeStandalone={makeStandalone}
          absorb={absorb}
        />

        {/* Add existing article */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold themed-secondary mb-3">Add existing article</h3>
            <ToastForm action={addChapter} errorTitle="Section not added" className="space-y-2">
              <input type="hidden" name="bookId" value={bookRow.id} />
              <input type="hidden" name="position" value={rows.length} />
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
              <button type="submit" className="themed-btn-outline rounded-lg text-sm">
                Add section
              </button>
            </ToastForm>
          </div>

          <div>
            <h3 className="text-sm font-semibold themed-secondary mb-3">
              Create internal section
            </h3>
            <ToastForm action={newInternalArticle} errorTitle="Section not added" className="space-y-2">
              <input type="hidden" name="bookId" value={bookRow.id} />
              <input type="hidden" name="position" value={rows.length} />
              <input
                name="title"
                type="text"
                required
                placeholder="Section title"
                maxLength={200}
                className="themed-input text-sm"
              />
              <input
                name="slug"
                type="text"
                required
                placeholder="article-my-section"
                pattern="^article-[a-z0-9]+(?:-[a-z0-9]+)*$"
                title="Must start with 'article-' followed by lowercase letters, numbers, and hyphens"
                className="themed-input text-sm"
              />
              <p className="text-xs themed-muted">Must start with &ldquo;article-&rdquo; (e.g. article-intro).</p>
              <button type="submit" className="themed-btn-outline rounded-lg text-sm">
                Create section
              </button>
            </ToastForm>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold themed-secondary mb-3">
              Add part
            </h3>
            <p className="text-xs themed-muted mb-3">
              A part is the top-level heading. Chapters and sections listed after
              it belong to that part until the next one. Reorder it like any
              section.
            </p>
            <form action={addPartAction} className="flex gap-2">
              <input type="hidden" name="bookId" value={bookRow.id} />
              <input type="hidden" name="position" value={rows.length} />
              <input
                name="title"
                type="text"
                required
                maxLength={200}
                placeholder="Part I: Foundations"
                className="themed-input text-sm flex-1"
              />
              <button type="submit" className="themed-btn-outline rounded-lg text-sm">
                Add part
              </button>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-semibold themed-secondary mb-3">
              Add chapter
            </h3>
            <p className="text-xs themed-muted mb-3">
              A chapter is the middle-level heading between a part and its
              sections. Sections listed after it belong to that chapter until the
              next one.
            </p>
            <form action={addChapterDividerAction} className="flex gap-2">
              <input type="hidden" name="bookId" value={bookRow.id} />
              <input type="hidden" name="position" value={rows.length} />
              <input
                name="title"
                type="text"
                required
                maxLength={200}
                placeholder="Chapter 1: Getting started"
                className="themed-input text-sm flex-1"
              />
              <button type="submit" className="themed-btn-outline rounded-lg text-sm">
                Add chapter
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
          <ToastForm action={addExternal} errorTitle="Section not added" className="space-y-2">
            <input type="hidden" name="bookId" value={bookRow.id} />
            <input type="hidden" name="position" value={rows.length} />
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
              placeholder="article-my-section"
              pattern="^article-[a-z0-9]+(?:-[a-z0-9]+)*$"
              title="Article slug, e.g. article-intro"
              className="themed-input text-sm"
            />
            <button type="submit" className="themed-btn-outline rounded-lg text-sm">
              Add external section
            </button>
          </ToastForm>
        </div>
      </section>

      <section className="mt-12 border-t themed-border pt-8">
        <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--color-error)" }}>Danger zone</h2>
        <p className="text-sm themed-muted mb-4">
          Deleting a book moves it to the bin for 30 days, then it is permanently removed
          along with its curriculum entries and internal articles.
        </p>
        <ToastForm action={deleteBook.bind(null, publisherSlug)} errorTitle="Not deleted">
          <input type="hidden" name="bookId" value={bookRow.id} />
          <ConfirmButton
            title="Delete book"
            message="This moves the book to the bin for 30 days, then permanently removes it along with its curriculum entries and internal sections."
            confirmLabel="Delete book"
            danger
            className="themed-btn-danger rounded-lg"
          >
            Delete book
          </ConfirmButton>
        </ToastForm>
      </section>
    </main>
  );
}
