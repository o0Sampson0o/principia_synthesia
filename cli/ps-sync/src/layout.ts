/**
 * Where an article lives inside the sync folder.
 *
 *   <publisher>/articles/<slug>.<ext>              standalone articles
 *   <publisher>/books/<book>/<slug>.<ext>          book sections
 *
 * Sections are nested under their book because a book-internal slug is only
 * unique within that book — two books can each have an "intro", and a flat
 * `articles/` folder would map both onto one file.
 *
 * The book index note keeps its own path (`<publisher>/books/<book>.<ext>`),
 * sitting alongside the folder of the sections it lists.
 */

export interface ArticlePlacement {
  slug: string;
  parentBookSlug: string | null;
}

export function articlePath(
  publisher: string,
  article: ArticlePlacement,
  extension: string
): string {
  const dir = article.parentBookSlug
    ? `${publisher}/books/${article.parentBookSlug}`
    : `${publisher}/articles`;
  return `${dir}/${article.slug}.${extension}`;
}

export function bookNotePath(publisher: string, bookSlug: string, extension: string): string {
  return `${publisher}/books/${bookSlug}.${extension}`;
}

/**
 * The book a local path implies, or null for a standalone article.
 * Used when creating remote articles from untracked files, so a file dropped
 * into a book folder is reported against the right book.
 */
export function bookFromPath(path: string): string | null {
  const parts = path.split("/");
  // <publisher>/books/<book>/<file>
  if (parts.length === 4 && parts[1] === "books") return parts[2];
  return null;
}
