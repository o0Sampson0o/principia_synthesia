import { init } from "./commands/init";
import { pull } from "./commands/pull";
import { push } from "./commands/push";
import { status } from "./commands/status";
import { ApiError } from "./api";

const HELP = `ps-sync — sync Principia Synthesia articles with a local folder,
editable in any markdown editor (Obsidian, VS Code, Typora, vim, ...).

Quickstart (no install beyond Node 18+):
  1. Create a token at <server>/settings/api-tokens
  2. In the folder you want to sync into:
       node ps-sync.mjs init   # server is auto-detected; paste your token
       node ps-sync.mjs pull

Usage: node ps-sync.mjs <command> [options]

Commands:
  init      Connect this folder to a server (writes .ps-sync.json + token)
              --server <url> --token <pst_...> --publishers <a,b>
              --extension <md|mdx>  --links <markdown|wikilink>
  pull      Download new/changed articles; refuses to overwrite local edits
              --publisher <slug>  --write-conflicts  --no-books
              --only <a,b>  --except <a,b>
  push      Upload locally edited articles (If-Match guarded; rejects on conflict)
              --publisher <slug>  --dry-run  --create  --delete  --allow-invalid-frontmatter
              --only <a,b>  --except <a,b>
  status    Show what would be pulled/pushed; exit code 1 if conflicts exist
              --publisher <slug>  --only <a,b>  --except <a,b>

Selecting what to sync (article/book slugs; default is everything):
  --only  a,b,c   sync only these slugs, skip the rest (inclusive)
  --except a,b,c  sync everything except these slugs (exclusive)
  The two are mutually exclusive; a slug may name an article or a book.

Token: create one at <server>/settings/api-tokens. Provide via PS_SYNC_TOKEN or init.
Layout: <publisher>/articles/<slug>.md (tracked) and <publisher>/books/<slug>.md (read-only).
`;

async function main(): Promise<number> {
  if (typeof fetch !== "function") {
    console.error("ps-sync requires Node.js 18 or newer (built-in fetch).");
    return 1;
  }
  const [cmd, ...rest] = process.argv.slice(2);
  const root = process.cwd();

  switch (cmd) {
    case "init":
      return init(root, rest);
    case "pull":
      return pull(root, rest);
    case "push":
      return push(root, rest);
    case "status":
      return status(root, rest);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      return cmd === undefined ? 1 : 0;
    default:
      console.error(`Unknown command "${cmd}".\n`);
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (err instanceof ApiError) {
      console.error(`Error (${err.status || "network"}, ${err.code}): ${err.message}`);
    } else {
      console.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  });
