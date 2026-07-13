import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { ApiClient, ApiError, ConflictError } from "../api";
import { loadConfig, resolveToken } from "../config";
import { parseBookNote, structureLocalHash } from "../book-note";
import {
  deriveTitle,
  injectPsId,
  semanticHash,
  slugFromFilename,
  stripPsId,
  validateFrontmatter,
} from "../content";
import { indexByPsId, scanVault } from "../scan";
import { loadState, saveState, stateKey } from "../state";
import { findUntracked, localSemanticHash } from "../sync-status";
import { cliCommand } from "../invocation";

export async function push(root: string, argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      publisher: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      create: { type: "boolean", default: false },
      delete: { type: "boolean", default: false },
      "allow-invalid-frontmatter": { type: "boolean", default: false },
    },
  });

  const config = loadConfig(root);
  const api = new ApiClient(config.server, resolveToken(root));
  const state = loadState(root);
  const dryRun = values["dry-run"];
  const publishers = values.publisher ? [values.publisher] : config.publishers;

  const files = scanVault(root, config.extension);
  const { byId, duplicates } = indexByPsId(files);
  for (const [id, dups] of duplicates) {
    console.warn(`! duplicate ps-id ${id} in: ${dups.map((d) => d.path).join(", ")} — using ${dups[0].path}`);
  }
  const byPath = new Map(files.map((f) => [f.path, f]));

  let pushed = 0;
  let created = 0;
  let deleted = 0;
  let conflicts = 0;
  let skippedInvalid = 0;
  let pendingNew = 0;
  let pendingDelete = 0;

  // --- Tracked files: update or delete ------------------------------------
  for (const [key, st] of Object.entries(state.articles)) {
    if (!publishers.includes(st.publisher)) continue;

    const file = byId.get(st.articleId) ?? byPath.get(st.path) ?? null;

    if (!file) {
      if (!values.delete) {
        pendingDelete++;
        console.log(`? ${st.path} — missing locally (run with --delete to delete remotely)`);
        continue;
      }
      if (dryRun) {
        console.log(`- would delete remotely: ${st.publisher}/${st.slug}`);
        continue;
      }
      try {
        await api.deleteArticle(st.publisher, st.slug, st.baseHash);
        delete state.articles[key];
        deleted++;
        console.log(`- deleted remotely: ${st.publisher}/${st.slug}`);
      } catch (err) {
        if (err instanceof ConflictError) {
          conflicts++;
          console.warn(`C ${st.publisher}/${st.slug} — changed remotely; not deleting (pull first)`);
        } else if (err instanceof ApiError && err.status === 404) {
          delete state.articles[key]; // already gone
        } else {
          throw err;
        }
      }
      continue;
    }

    if (file.path !== st.path) st.path = file.path;

    const localHash = localSemanticHash(file);
    if (localHash === st.baseSemanticHash) continue; // clean

    const { content: stripped } = stripPsId(file.content);
    const fm = validateFrontmatter(stripped);
    if (!fm.valid && !values["allow-invalid-frontmatter"]) {
      skippedInvalid++;
      console.warn(`! ${file.path} — ${fm.problem}`);
      console.warn(`  fix the frontmatter or push with --allow-invalid-frontmatter`);
      continue;
    }

    if (dryRun) {
      console.log(`~ would push: ${file.path}`);
      pushed++;
      continue;
    }

    try {
      const res = await api.updateArticle(
        st.publisher,
        st.slug,
        { content: stripped, editNote: "Synced via ps-sync" },
        st.baseHash
      );
      st.baseHash = res.contentHash;
      st.baseSemanticHash = localHash;
      st.remoteUpdatedAt = res.updatedAt;
      pushed++;
      console.log(`~ pushed: ${file.path}`);
    } catch (err) {
      if (err instanceof ConflictError) {
        conflicts++;
        console.warn(`C ${file.path} — changed remotely since your last pull (run "${cliCommand()} pull", merge, then push)`);
      } else {
        throw err;
      }
    }
  }

  // --- Untracked files: create with --create -------------------------------
  for (const pub of publishers) {
    for (const file of findUntracked(files, pub)) {
      if (!values.create) {
        pendingNew++;
        console.log(`+ ${file.path} — new file (run with --create to publish)`);
        continue;
      }

      let slug: string;
      try {
        slug = slugFromFilename(basename(file.path));
      } catch (err) {
        console.warn(`! ${file.path} — ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const title = deriveTitle(file.content, basename(file.path));

      const fm = validateFrontmatter(file.content);
      if (!fm.valid && !values["allow-invalid-frontmatter"]) {
        skippedInvalid++;
        console.warn(`! ${file.path} — ${fm.problem}`);
        continue;
      }

      if (dryRun) {
        console.log(`+ would create: ${file.path} → ${pub}/${slug} ("${title}")`);
        created++;
        continue;
      }

      try {
        const res = await api.createArticle(pub, { slug, title, content: file.content });
        writeFileSync(join(root, file.path), injectPsId(file.content, res.id));
        state.articles[stateKey(pub, slug)] = {
          articleId: res.id,
          slug,
          publisher: pub,
          path: file.path,
          baseHash: res.contentHash,
          baseSemanticHash: semanticHash(file.content),
          remoteUpdatedAt: res.updatedAt,
        };
        created++;
        console.log(`+ created: ${file.path} → ${pub}/${slug}`);
      } catch (err) {
        if (err instanceof ApiError && err.code === "slug_exists") {
          conflicts++;
          console.warn(`C ${file.path} — slug "${slug}" already exists remotely (pull first or rename the file)`);
        } else {
          throw err;
        }
      }
    }
  }

  // --- Book structure: reorder / re-part existing chapters ----------------
  let booksPushed = 0;
  for (const bst of Object.values(state.books ?? {})) {
    if (!publishers.includes(bst.publisher)) continue;
    const abs = join(root, bst.path);
    if (!existsSync(abs)) continue;
    const parsed = parseBookNote(readFileSync(abs, "utf8"));
    const localHash = structureLocalHash(parsed.chapters);
    if (localHash === bst.baseLocalHash) continue; // clean

    if (dryRun) {
      console.log(`~ would push book structure: ${bst.path}`);
      booksPushed++;
      continue;
    }
    try {
      const res = await api.updateBookStructure(
        bst.publisher,
        bst.slug,
        parsed.chapters,
        bst.baseHash
      );
      bst.baseHash = res.structureHash;
      bst.baseLocalHash = localHash;
      booksPushed++;
      console.log(`~ pushed book structure: ${bst.path}`);
    } catch (err) {
      if (err instanceof ConflictError) {
        conflicts++;
        console.warn(`C ${bst.path} — book reordered remotely since your last pull (pull first)`);
      } else if (err instanceof ApiError && err.code === "chapter_set_mismatch") {
        conflicts++;
        console.warn(
          `C ${bst.path} — chapters added/removed locally; ps-sync only reorders. ` +
            `Add/remove chapters in the web UI, then pull.`
        );
      } else {
        throw err;
      }
    }
  }

  if (!dryRun) saveState(root, state);

  const verb = dryRun ? "would push" : "pushed";
  console.log(
    `\npush done: ${pushed} ${verb}, ${created} created, ${deleted} deleted, ` +
      `${booksPushed} book structure(s), ` +
      `${pendingNew} new pending --create, ${pendingDelete} pending --delete, ` +
      `${skippedInvalid} skipped (invalid frontmatter), ${conflicts} conflict(s)`
  );
  return conflicts > 0 ? 1 : 0;
}
