import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { cliCommand } from "./invocation";

export const CONFIG_FILE = ".ps-sync.json";
export const STATE_DIR = ".ps-sync";
export const TOKEN_FILE = "token";

export interface SyncConfig {
  server: string;
  publishers: string[];
  /** File extension for pulled articles; "md" so any markdown editor opens them. */
  extension: string;
  /**
   * Link style used in generated book index notes:
   * "markdown" (default) — relative links, portable to any editor;
   * "wikilink" — [[slug|Title]] links for wikilink-native editors like Obsidian.
   */
  links: "markdown" | "wikilink";
}

export function loadConfig(root: string): SyncConfig {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    throw new Error(`No ${CONFIG_FILE} found in ${root}. Run "${cliCommand()} init" first.`);
  }
  const cfg = JSON.parse(readFileSync(path, "utf8")) as Partial<SyncConfig>;
  if (!cfg.server || !Array.isArray(cfg.publishers) || cfg.publishers.length === 0) {
    throw new Error(`${CONFIG_FILE} is missing "server" or "publishers".`);
  }
  return {
    server: cfg.server,
    publishers: cfg.publishers,
    extension: cfg.extension || "md",
    links: cfg.links === "wikilink" ? "wikilink" : "markdown",
  };
}

export function saveConfig(root: string, config: SyncConfig): void {
  writeFileSync(join(root, CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
}

/** PS_SYNC_TOKEN env var wins; falls back to the gitignored .ps-sync/token file. */
export function resolveToken(root: string): string {
  const fromEnv = process.env.PS_SYNC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const path = join(root, STATE_DIR, TOKEN_FILE);
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  throw new Error(
    `No API token found. Set PS_SYNC_TOKEN or run "${cliCommand()} init" (writes ${STATE_DIR}/${TOKEN_FILE}).`
  );
}

export function saveToken(root: string, token: string): void {
  mkdirSync(join(root, STATE_DIR), { recursive: true });
  writeFileSync(join(root, STATE_DIR, TOKEN_FILE), token + "\n", { mode: 0o600 });
}

/** Keeps the token/state dir out of git when the sync folder is a repo. */
export function ensureGitignore(root: string): void {
  const path = join(root, ".gitignore");
  const entry = `${STATE_DIR}/`;
  if (existsSync(path)) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    if (lines.includes(entry) || lines.includes(STATE_DIR)) return;
    appendFileSync(path, `\n${entry}\n`);
  } else if (existsSync(join(root, ".git"))) {
    writeFileSync(path, `${entry}\n`);
  }
}
