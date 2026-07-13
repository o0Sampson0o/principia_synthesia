import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { ApiClient, type RemoteArticle } from "../api";
import { loadConfig, resolveToken } from "../config";
import { injectPsId, semanticHash } from "../content";
import { parseBookNote, renderBookNote, structureLocalHash } from "../book-note";
import { indexByPsId, scanVault } from "../scan";
import { loadState, saveState, stateKey, type ArticleState, type SyncState } from "../state";
import { analyzeEntry, localSemanticHash } from "../sync-status";

interface PullCounts {
  created: number;
  updated: number;
  deleted: number;
  relinked: number;
  conflicts: number;
  missing: number;
}

function writeArticleFile(root: string, path: string, article: RemoteArticle): void {
  const abs = join(root, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, injectPsId(article.content, article.id));
}

function recordState(
  state: SyncState,
  publisher: string,
  article: RemoteArticle,
  path: string
): void {
  state.articles[stateKey(publisher, article.slug)] = {
    articleId: article.id,
    slug: article.slug,
    publisher,
    path,
    baseHash: article.contentHash,
    baseSemanticHash: semanticHash(article.content),
    remoteUpdatedAt: article.updatedAt,
  } satisfies ArticleState;
}


export async function pull(root: string, argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      publisher: { type: "string" },
      "write-conflicts": { type: "boolean", default: false },
      "no-books": { type: "boolean", default: false },
    },
  });

  const config = loadConfig(root);
  const api = new ApiClient(config.server, resolveToken(root));
  const state = loadState(root);
  const ext = config.extension;
  const publishers = values.publisher ? [values.publisher] : config.publishers;

  const counts: PullCounts = { created: 0, updated: 0, deleted: 0, relinked: 0, conflicts: 0, missing: 0 };

  for (const pub of publishers) {
    const files = scanVault(root, ext);
    const { byId, duplicates } = indexByPsId(files);
    for (const [id, dups] of duplicates) {
      console.warn(`! duplicate ps-id ${id} in: ${dups.map((d) => d.path).join(", ")} — using ${dups[0].path}`);
    }
    const byPath = new Map(files.map((f) => [f.path, f]));
    const { articles: remoteList } = await api.listArticles(pub);
    const remoteSlugs = new Set(remoteList.map((r) => r.slug));

    for (const remote of remoteList) {
      const key = stateKey(pub, remote.slug);
      const st = state.articles[key];

      if (!st) {
        const local = byId.get(remote.id) ?? null;
        const full = await api.getArticle(pub, remote.slug);

        if (local) {
          // File carries this article's ps-id but state has no record (state
          // lost or folder copied) — re-link instead of overwriting.
          if (localSemanticHash(local) === semanticHash(full.content)) {
            recordState(state, pub, full, local.path);
            counts.relinked++;
          } else {
            counts.conflicts++;
            console.warn(`C ${local.path} — differs from remote and no sync base is recorded`);
            if (values["write-conflicts"]) {
              writeFileSync(join(root, local.path.replace(/\.[^.]+$/, `.remote.${ext}`)), full.content);
            }
          }
          continue;
        }

        const path = `${pub}/articles/${remote.slug}.${ext}`;
        if (byPath.has(path)) {
          counts.conflicts++;
          console.warn(`C ${path} — untracked local file is in the way of a new remote article`);
          continue;
        }
        writeArticleFile(root, path, full);
        recordState(state, pub, full, path);
        counts.created++;
        console.log(`+ ${path}`);
        continue;
      }

      const file = byId.get(st.articleId) ?? byPath.get(st.path) ?? null;
      if (file && file.path !== st.path) {
        st.path = file.path; // moved/renamed locally; ps-id re-links it
      }
      const entry = analyzeEntry(key, st, file, remote);

      switch (entry.status) {
        case "remote-changed": {
          const full = await api.getArticle(pub, remote.slug);
          writeArticleFile(root, st.path, full);
          recordState(state, pub, full, st.path);
          counts.updated++;
          console.log(`~ ${st.path}`);
          break;
        }
        case "conflict": {
          counts.conflicts++;
          console.warn(`C ${st.path} — edited both locally and remotely (pull left it untouched)`);
          if (values["write-conflicts"]) {
            const full = await api.getArticle(pub, remote.slug);
            const sidePath = st.path.replace(/\.[^.]+$/, `.remote.${ext}`);
            writeFileSync(join(root, sidePath), full.content);
            console.warn(`  wrote remote version to ${sidePath}`);
          }
          break;
        }
        case "missing-local": {
          counts.missing++;
          console.warn(`? ${st.path} — tracked file is missing locally (push --delete removes it remotely; delete the state entry to re-pull)`);
          break;
        }
        // "clean" | "modified": nothing to pull; push handles modified.
      }
    }

    // Articles deleted remotely
    for (const [key, st] of Object.entries(state.articles)) {
      if (st.publisher !== pub || remoteSlugs.has(st.slug)) continue;
      const file = byId.get(st.articleId) ?? byPath.get(st.path) ?? null;
      const entry = analyzeEntry(key, st, file, null);
      if (entry.status === "gone") {
        delete state.articles[key];
      } else if (entry.status === "remote-deleted") {
        rmSync(join(root, file!.path));
        delete state.articles[key];
        counts.deleted++;
        console.log(`- ${file!.path} (deleted remotely)`);
      } else {
        counts.conflicts++;
        console.warn(`C ${st.path} — deleted remotely but has local edits (kept)`);
      }
    }

    // Editable book index notes (reorder / re-part chapters here).
    if (!values["no-books"]) {
      const { books } = await api.listBooks(pub);
      for (const b of books) {
        const book = await api.getBook(pub, b.slug);
        const path = `${pub}/books/${b.slug}.${ext}`;
        const abs = join(root, path);
        const key = stateKey(pub, b.slug);
        const st = state.books![key];
        const local = existsSync(abs) ? readFileSync(abs, "utf8") : null;
        const localDirty =
          st && local !== null
            ? structureLocalHash(parseBookNote(local).chapters) !== st.baseLocalHash
            : false;
        const remoteChanged = st ? book.structureHash !== st.baseHash : true;

        if (local !== null && localDirty && remoteChanged) {
          counts.conflicts++;
          console.warn(`C ${path} — book reordered both locally and remotely (left untouched)`);
          continue;
        }
        if (local !== null && localDirty) {
          // local edits pending push; leave the file
          continue;
        }
        const rendered = renderBookNote(book, config.links, ext);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, rendered);
        state.books![key] = {
          slug: b.slug,
          publisher: pub,
          path,
          baseHash: book.structureHash,
          baseLocalHash: structureLocalHash(
            parseBookNote(rendered).chapters
          ),
        };
      }
      if (books.length > 0) console.log(`i refreshed ${books.length} book index note(s) for ${pub}`);
    }
  }

  saveState(root, state);

  console.log(
    `\npull done: ${counts.created} new, ${counts.updated} updated, ${counts.deleted} removed, ` +
      `${counts.relinked} re-linked, ${counts.missing} missing, ${counts.conflicts} conflict(s)`
  );
  return counts.conflicts > 0 ? 1 : 0;
}
