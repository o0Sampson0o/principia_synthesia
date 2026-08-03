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

### Syncing only some articles or books

By default every command syncs all your articles and books. To narrow it down,
`pull`, `push` and `status` accept two mutually exclusive slug filters:

```bash
ps-sync pull --only intro,chapter-1         # only these, skip the rest
ps-sync push --except draft-notes,scratch   # everything except these
ps-sync pull --only relativity              # a whole book, sections included
ps-sync pull --only relativity/intro        # one section of one book
ps-sync push --except mechanics/intro       # all but that one section
```

- `--only` is an **inclusive** allowlist — sync just the listed terms.
- `--except` is an **exclusive** denylist — sync everything but the listed terms.
- A bare term may name an article, a book (which selects every section in it),
  or a section slug — and section slugs repeat across books, so a bare `intro`
  matches the `intro` of *every* book.
- Use the qualified `book/section` form to pin down exactly one section.
- Terms are comma-separated; give neither flag to sync everything (the default).
- A term that matches no real slug is reported, so typos don't fail silently.

### Folder layout

```
<publisher>/articles/<slug>.md          standalone articles   (tracked)
<publisher>/books/<book>/<slug>.md      book sections         (tracked)
<publisher>/books/<book>.md             book index note       (reorder here)
```

Sections live under their book because a book-internal slug is only unique
*within* that book — two books can each have an `intro`, and a flat folder
would map both onto one file. Files are tracked by their `ps-id`, not their
path, so you can move or rename them freely and the next sync re-links them.

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
