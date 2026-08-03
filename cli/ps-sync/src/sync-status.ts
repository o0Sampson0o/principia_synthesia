import type { RemoteArticleSummary } from "./api";
import { semanticHash, stripPsId } from "./content";
import type { LocalFile } from "./scan";
import type { ArticleState } from "./state";

export type EntryStatus =
  | "clean"
  | "modified" // local edit, remote unchanged → push
  | "remote-changed" // remote edit, local clean → pull
  | "conflict" // both sides moved since base
  | "missing-local" // tracked file deleted locally, remote still exists
  | "remote-deleted" // remote gone, local clean → pull removes
  | "remote-deleted-conflict" // remote gone but local has edits
  | "gone"; // remote gone and local gone → drop state

export interface AnalyzedEntry {
  key: string;
  st: ArticleState;
  file: LocalFile | null;
  remote: RemoteArticleSummary | null;
  localDirty: boolean;
  remoteChanged: boolean;
  status: EntryStatus;
}

/** Reformat-stable hash of a local file after removing the sync-only ps-id key. */
export function localSemanticHash(file: LocalFile): string {
  return semanticHash(stripPsId(file.content).content);
}

/**
 * Three-way classification of one tracked article: base (state) vs local file
 * vs remote summary. `remote` is null when the article no longer exists
 * remotely.
 */
export function analyzeEntry(
  key: string,
  st: ArticleState,
  file: LocalFile | null,
  remote: RemoteArticleSummary | null
): AnalyzedEntry {
  const localDirty = file ? localSemanticHash(file) !== st.baseSemanticHash : false;
  const remoteChanged = remote ? remote.contentHash !== st.baseHash : false;

  let status: EntryStatus;
  if (!remote) {
    status = !file ? "gone" : localDirty ? "remote-deleted-conflict" : "remote-deleted";
  } else if (!file) {
    status = "missing-local";
  } else if (localDirty && remoteChanged) {
    status = "conflict";
  } else if (localDirty) {
    status = "modified";
  } else if (remoteChanged) {
    status = "remote-changed";
  } else {
    status = "clean";
  }

  return { key, st, file, remote, localDirty, remoteChanged, status };
}

/** Untracked candidate files for `push --create`: no ps-id, in an article slot. */
export function findUntracked(files: LocalFile[], publisher: string): LocalFile[] {
  return files.filter((f) => f.psId === null && isArticleSlot(f.path, publisher));
}

/**
 * True for paths where an article file belongs:
 *   <publisher>/articles/<slug>.<ext>       standalone
 *   <publisher>/books/<book>/<slug>.<ext>   section
 * The book *index* note lives at <publisher>/books/<book>.<ext> — one level
 * shallower — so it is deliberately excluded.
 */
function isArticleSlot(path: string, publisher: string): boolean {
  const parts = path.split("/");
  if (parts[0] !== publisher) return false;
  if (parts.length === 3 && parts[1] === "articles") return true;
  return parts.length === 4 && parts[1] === "books";
}
