# principia-sync (`ps-sync`)

Sync your [Principia Synthesia](https://www.principiasynthesia.org) articles to
a local folder as markdown files — editable with **any** editor (Obsidian, VS
Code, Typora, vim, …) — and push your changes back. Git-like: `pull` downloads,
`push` uploads, conflicts are rejected rather than merged silently.

The whole tool is one self-contained file; the only requirement is **Node 18+**.

## Install

```bash
npm install -g principia-sync
# or run without installing:
npx principia-sync init
```

(If you'd rather not install anything, every Principia Synthesia site also
serves the same CLI at `https://<site>/ps-sync.mjs` — `curl -O` it and run
`node ps-sync.mjs`.)

## Quickstart

```bash
# 1. Create an API token at <your-site>/settings/api-tokens
# 2. In the folder you want to sync into:
ps-sync init          # enter your site URL and paste the token
ps-sync pull          # download your articles as .md files
# ...edit in your editor of choice...
ps-sync status        # see what changed
ps-sync push          # upload; conflicts are reported, never merged
```

## Commands

| Command | What it does |
|---|---|
| `init` | Connect a folder to a site (writes `.ps-sync.json` + a gitignored token). |
| `pull` | Download new/changed articles; refuses to overwrite local edits. Also writes editable book index files. |
| `push` | Upload locally edited articles and book reorderings (`--dry-run`, `--create`, `--delete`). |
| `status` | Show what would be pulled/pushed; exit code 1 if conflicts exist. |

Run `ps-sync help` for all flags.

## How it works

- Articles round-trip as pure markdown; a single `ps-id` frontmatter key tracks
  identity across renames (editors preserve unknown keys). It's stripped before
  upload, so stored content stays clean.
- Change detection compares *parsed* frontmatter + body, so editors that
  reformat YAML don't produce phantom diffs.
- Every push carries an `If-Match` precondition; if the article (or book order)
  changed on the server since your last pull, the push is rejected and you
  re-pull to reconcile. Nothing is silently overwritten.

## License

MIT
