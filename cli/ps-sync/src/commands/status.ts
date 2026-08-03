import { basename } from "node:path";
import { parseArgs } from "node:util";
import { ApiClient } from "../api";
import { loadConfig, resolveToken } from "../config";
import { slugFromFilename } from "../content";
import { indexByPsId, scanVault } from "../scan";
import { articleKey, loadState } from "../state";
import { articlePath, bookFromPath } from "../layout";
import { analyzeEntry, findUntracked, type EntryStatus } from "../sync-status";
import { Selection } from "../selection";

const LABELS: Record<EntryStatus, string> = {
  clean: "",
  modified: "M  modified (push)",
  "remote-changed": "R  remote changed (pull)",
  conflict: "C  CONFLICT (both changed)",
  "missing-local": "?  missing locally (--delete)",
  "remote-deleted": "D  deleted remotely (pull removes)",
  "remote-deleted-conflict": "C  CONFLICT (deleted remotely, edited locally)",
  gone: "",
};

export async function status(root: string, argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      publisher: { type: "string" },
      only: { type: "string" },
      except: { type: "string" },
    },
  });

  const config = loadConfig(root);
  const api = new ApiClient(config.server, resolveToken(root));
  const state = loadState(root);
  const publishers = values.publisher ? [values.publisher] : config.publishers;
  const selection = new Selection(values.only, values.except);

  const files = scanVault(root, config.extension);
  const { byId } = indexByPsId(files);
  const byPath = new Map(files.map((f) => [f.path, f]));

  let interesting = 0;
  let conflicts = 0;

  for (const pub of publishers) {
    const { articles: remoteList } = await api.listArticles(pub);
    const remoteByKey = new Map(
      remoteList.map((r) => [articleKey(pub, r.slug, r.parentBookSlug), r])
    );
    console.log(`\n${pub}:`);

    for (const [key, st] of Object.entries(state.articles)) {
      if (st.publisher !== pub) continue;
      if (!selection.isSelected(st.slug, st.book)) continue;
      const file = byId.get(st.articleId) ?? byPath.get(st.path) ?? null;
      const entry = analyzeEntry(key, st, file, remoteByKey.get(key) ?? null);
      if (entry.status === "clean" || entry.status === "gone") continue;
      interesting++;
      if (entry.status.includes("conflict") || entry.status === "conflict") conflicts++;
      console.log(`  ${LABELS[entry.status]}  ${file?.path ?? st.path}`);
    }

    // Remote articles never pulled
    for (const r of remoteList) {
      if (!selection.isSelected(r.slug, r.parentBookSlug)) continue;
      if (!state.articles[articleKey(pub, r.slug, r.parentBookSlug)] && !byId.has(r.id)) {
        interesting++;
        console.log(`  N  not pulled yet            ${articlePath(pub, r, config.extension)}`);
      }
    }

    for (const f of findUntracked(files, pub)) {
      if (selection.active) {
        let fileSlug: string | null = null;
        try {
          fileSlug = slugFromFilename(basename(f.path));
        } catch {
          // Undeterminable slug: an allowlist can't include it; --except keeps it.
        }
        const fileBook = bookFromPath(f.path);
        if (fileSlug !== null ? !selection.isSelected(fileSlug, fileBook) : selection.inclusive) {
          continue;
        }
      }
      interesting++;
      // Sections can't be created by sync — flag them as such rather than
      // promising `push --create` will publish them.
      if (bookFromPath(f.path) !== null) {
        console.log(`  A  new section (web UI only)  ${f.path}`);
      } else {
        console.log(`  A  new local (push --create)  ${f.path}`);
      }
    }
  }

  selection.warnUnmatched();

  if (interesting === 0) {
    console.log("\nEverything in sync.");
  }
  return conflicts > 0 ? 1 : 0;
}
