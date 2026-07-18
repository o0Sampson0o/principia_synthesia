export interface TocEntry {
  bookSlug: string;
  bookTitle: string;
  position: number;
  partTitle: string | null;
  chapterTitle: string | null;
  articleSlug: string;
  articleTitle: string;
  entryId: number;
}

export interface BookToc {
  bookTitle: string;
  entries: TocEntry[];
}

/**
 * Groups a flat list of curriculum entries into a map keyed by bookSlug.
 * Preserves the original ordering of entries within each book.
 */
export function buildBookTOC(entries: TocEntry[]): Record<string, BookToc> {
  const books: Record<string, BookToc> = {};
  for (const e of entries) {
    if (!books[e.bookSlug]) {
      books[e.bookSlug] = { bookTitle: e.bookTitle, entries: [] };
    }
    books[e.bookSlug].entries.push(e);
  }
  return books;
}
