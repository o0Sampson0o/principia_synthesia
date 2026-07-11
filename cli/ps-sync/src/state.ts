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
  /** Path (relative to the sync folder) the article was written to (may move; ps-id re-links). */
  path: string;
  baseHash: string;
  baseSemanticHash: string;
  remoteUpdatedAt: string | null;
}

export interface SyncState {
  version: 1;
  /** Keyed by `${publisher}/${slug}`. */
  articles: Record<string, ArticleState>;
}

export function stateKey(publisher: string, slug: string): string {
  return `${publisher}/${slug}`;
}

export function loadState(root: string): SyncState {
  const path = join(root, STATE_DIR, STATE_FILE);
  if (!existsSync(path)) return { version: 1, articles: {} };
  return JSON.parse(readFileSync(path, "utf8")) as SyncState;
}

export function saveState(root: string, state: SyncState): void {
  mkdirSync(join(root, STATE_DIR), { recursive: true });
  writeFileSync(join(root, STATE_DIR, STATE_FILE), JSON.stringify(state, null, 2) + "\n");
}
