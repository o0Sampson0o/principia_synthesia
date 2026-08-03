import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./config";

const STATE_FILE = "state.json";

/**
 * Per-article sync baseline, recorded at pull/push time.
 *
 * `baseHash` is the server-reported sha256 of the exact stored content — used
 * to detect remote drift (never recomputed locally). `baseSemanticHash` is the
 * reformat-stable hash of the same content — used to detect local edits even
 * after the editor rewrites the YAML formatting.
 */
export interface ArticleState {
  articleId: number;
  slug: string;
  publisher: string;
  /** Owning book slug for internal articles; null for standalone ones. */
  book: string | null;
  /** Path (relative to the sync folder) the article was written to (may move; ps-id re-links). */
  path: string;
  baseHash: string;
  baseSemanticHash: string;
  remoteUpdatedAt: string | null;
}

export interface SyncState {
  version: 2;
  /** Keyed by `articleKey()` — book-qualified, since slugs repeat across books. */
  articles: Record<string, ArticleState>;
  /** Book structure baselines, keyed by `${publisher}/${bookSlug}`. */
  books?: Record<string, BookState>;
}

/** Sync baseline for a book's chapter order + part groupings. */
export interface BookState {
  slug: string;
  publisher: string;
  path: string;
  /** Server-reported structure hash at pull time (never recomputed locally). */
  baseHash: string;
  /** Hash of the local file's parsed structure at pull time (detects local edits). */
  baseLocalHash: string;
}

/** Key for books and other publisher-unique resources. */
export function stateKey(publisher: string, slug: string): string {
  return `${publisher}/${slug}`;
}

/**
 * Key for an article. Book-internal slugs are only unique within their book, so
 * two books can each hold an "intro" — the book has to be part of the key or
 * the second one silently overwrites the first.
 */
export function articleKey(
  publisher: string,
  slug: string,
  book: string | null
): string {
  return book ? `${publisher}/books/${book}/${slug}` : `${publisher}/articles/${slug}`;
}

export function loadState(root: string): SyncState {
  const path = join(root, STATE_DIR, STATE_FILE);
  if (!existsSync(path)) return { version: 2, articles: {}, books: {} };
  const state = JSON.parse(readFileSync(path, "utf8")) as SyncState;

  // v1 keyed articles by `${publisher}/${slug}` and had no `book`, so its keys
  // cannot be rewritten without knowing each article's book. Dropping the
  // article baselines is safe and self-healing: the next pull re-links every
  // file by its `ps-id` frontmatter and only reports a conflict where the local
  // copy genuinely differs from the server. Book baselines keep their shape.
  if (state.version !== 2) {
    console.warn(
      "i sync state upgraded to v2 (articles are now tracked per book) — " +
        "the next pull re-links your files by ps-id"
    );
    state.version = 2;
    state.articles = {};
  }

  if (!state.books) state.books = {};
  return state;
}

export function saveState(root: string, state: SyncState): void {
  mkdirSync(join(root, STATE_DIR), { recursive: true });
  writeFileSync(join(root, STATE_DIR, STATE_FILE), JSON.stringify(state, null, 2) + "\n");
}
