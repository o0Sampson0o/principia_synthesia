import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { readPsId } from "./content";

/** Directories never scanned for articles (sync state, editor config, VCS). */
const SKIP_DIRS = new Set([".ps-sync", ".obsidian", ".vscode", ".git", ".trash", "node_modules"]);

export interface LocalFile {
  /** Path relative to the sync folder root, with forward slashes. */
  path: string;
  absPath: string;
  content: string;
  psId: number | null;
}

/** Recursively lists all markdown files under the sync folder with their ps-id. */
export function scanVault(root: string, extension: string): LocalFile[] {
  const results: LocalFile[] = [];
  const suffix = `.${extension}`;

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(abs);
      } else if (name.endsWith(suffix)) {
        const content = readFileSync(abs, "utf8");
        results.push({
          path: relative(root, abs).split(sep).join("/"),
          absPath: abs,
          content,
          psId: readPsId(content),
        });
      }
    }
  }

  walk(root);
  return results;
}

/** Index a scan by ps-id (first file wins; duplicates reported separately). */
export function indexByPsId(files: LocalFile[]): {
  byId: Map<number, LocalFile>;
  duplicates: Map<number, LocalFile[]>;
} {
  const byId = new Map<number, LocalFile>();
  const duplicates = new Map<number, LocalFile[]>();
  for (const f of files) {
    if (f.psId === null) continue;
    const existing = byId.get(f.psId);
    if (existing) {
      const list = duplicates.get(f.psId) ?? [existing];
      list.push(f);
      duplicates.set(f.psId, list);
    } else {
      byId.set(f.psId, f);
    }
  }
  return { byId, duplicates };
}
