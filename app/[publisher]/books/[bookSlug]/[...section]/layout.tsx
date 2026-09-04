import { notFound } from "next/navigation";
import BookSpine from "@/components/book/BookSpine";
import { getBookRouteContext } from "@/lib/book-route";

/**
 * Shell for every page under a book: the spine on the left, the page's own
 * reading column on the right.
 *
 * The spine lives here rather than in the section page because a book's
 * contents belong to the ROUTE, not to the article. The same `articles` row can
 * be a standalone article, a section of this book, and a section of another
 * book at the same time (curriculum_entries is unique per book+article, and
 * addArticleToBook only checks canView) — so nothing about a book may leak into
 * the article renderer, which has to work with no book at all.
 *
 * `getBookRouteContext` is React-cached, so the queries here are the same ones
 * the page runs, not extra ones.
 */
export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;
  const ctx = await getBookRouteContext(publisherSlug, bookSlug);
  if (!ctx) notFound();

  // A layout renders in parallel with its page, so a page's notFound() still
  // paints this shell around the 404. Without this check the spine would show a
  // private book's whole table of contents to anyone who guessed the URL.
  const showSpine = ctx.visible && ctx.structure.orderedSections.length > 0;

  return (
    <div className="ps-book-shell">
      {showSpine && (
        <BookSpine
          publisherSlug={publisherSlug}
          bookSlug={bookSlug}
          bookTitle={ctx.book.title}
          bookHref={`/${publisherSlug}/books/${bookSlug}`}
          nodes={ctx.structure.children}
          sectionCount={ctx.structure.orderedSections.length}
          partCount={ctx.structure.parts.length}
        />
      )}
      <div className="ps-book-reading">{children}</div>
    </div>
  );
}
