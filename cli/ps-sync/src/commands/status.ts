import { parseArgs } from "node:util";
import { ApiClient } from "../api";
import { loadConfig, resolveToken } from "../config";
import { indexByPsId, scanVault } from "../scan";
import { loadState, stateKey } from "../state";
import { analyzeEntry, findUntracked, type EntryStatus } from "../sync-status";

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
    options: { publisher: { type: "string" } },
  });

  const config = loadConfig(root);
  const api = new ApiClient(config.server, resolveToken(root));
  const state = loadState(root);
  const publishers = values.publisher ? [values.publisher] : config.publishers;

  const files = scanVault(root, config.extension);
  const { byId } = indexByPsId(files);
  const byPath = new Map(files.map((f) => [f.path, f]));

  let interesting = 0;
  let conflicts = 0;

  for (const pub of publishers) {
    const { articles: remoteList } = await api.listArticles(pub);
    const remoteBySlug = new Map(remoteList.map((r) => [r.slug, r]));
    console.log(`\n${pub}:`);

    for (const [key, st] of Object.entries(state.articles)) {
      if (st.publisher !== pub) continue;
      const file = byId.get(st.articleId) ?? byPath.get(st.path) ?? null;
      const entry = analyzeEntry(key, st, file, remoteBySlug.get(st.slug) ?? null);
      if (entry.status === "clean" || entry.status === "gone") continue;
      interesting++;
      if (entry.status.includes("conflict") || entry.status === "conflict") conflicts++;
      console.log(`  ${LABELS[entry.status]}  ${file?.path ?? st.path}`);
    }

    // Remote articles never pulled
    for (const r of remoteList) {
      if (!state.articles[stateKey(pub, r.slug)] && !byId.has(r.id)) {
        interesting++;
        console.log(`  N  not pulled yet            ${pub}/articles/${r.slug}.${config.extension}`);
      }
    }

    for (const f of findUntracked(files, pub)) {
      interesting++;
      console.log(`  A  new local (push --create)  ${f.path}`);
    }
  }

  if (interesting === 0) {
    console.log("\nEverything in sync.");
  }
  return conflicts > 0 ? 1 : 0;
}
