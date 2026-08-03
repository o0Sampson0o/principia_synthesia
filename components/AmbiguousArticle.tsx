import Link from "next/link";
import { db } from "@/db";
import { books } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sectionHref } from "@/lib/book-structure";
import type { ArticleRow } from "@/lib/article-lookup";

/**
 * Shown when a bare `/[publisher]/articles/[slug]` URL matches sections of more
 * than one book. Book-internal slugs are only unique within their book, so this
 * is a real fork in the road rather than an error — list the candidates instead
 * of picking one arbitrarily.
 */
export default async function AmbiguousArticle({
  publisherSlug,
  slug,
  matches,
}: {
  publisherSlug: string;
  slug: string;
  matches: ArticleRow[];
}) {
  const bookIds = [...new Set(matches.map((a) => a.parentBookId).filter((id): id is number => id !== null))];
  const bookRows = bookIds.length
    ? await db.select({ id: books.id, slug: books.slug, title: books.title }).from(books).where(inArray(books.id, bookIds))
    : [];
  const byId = new Map(bookRows.map((b) => [b.id, b]));

  const options = matches
    .map((a) => ({ article: a, book: a.parentBookId ? byId.get(a.parentBookId) : undefined }))
    .filter((o) => o.book);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <p className="ps-eyebrow mb-1.5">Several matches</p>
      <h1 className="ps-display themed-heading mb-3" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
        Which “{slug}”?
      </h1>
      <p className="themed-secondary text-sm mb-6">
        More than one book has a section with this slug. Pick the one you meant.
      </p>
      <ul className="space-y-2">
        {options.map(({ article, book }) => (
          <li key={article.id}>
            <Link
              href={sectionHref(publisherSlug, book!.slug, article.slug)}
              className="block themed-surface themed-border border rounded px-4 py-3 themed-hover-border transition-colors"
            >
              <span className="block themed-foreground text-sm font-medium">{article.title}</span>
              <span className="block themed-muted text-xs mt-0.5">in {book!.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
