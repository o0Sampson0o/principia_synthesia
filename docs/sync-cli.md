# Sync API (`/api/v1`) and the `ps-sync` CLI

Round-trip editing of articles in a local folder using **any markdown editor**
(Obsidian, VS Code, Typora, vim, scripts, ...), backed by a per-user token
REST API. Git-like model: `pull` downloads, `push` uploads, conflicts are
**rejected**, never merged silently.

## Architecture

```
Local sync folder (.md files, any editor)
        │  ps-sync pull / push / status        (cli/ps-sync)
        ▼
/api/v1 REST routes                            (app/api/v1/**)
        │  Bearer token → SessionPayload       (lib/api-auth.ts)
        │  canEditContent gate                 (lib/roles.ts)
        ▼
Shared write core                              (lib/articles-write.ts)
        │  same invariants as the web editor:
        ▼  revisions, metadata mirror, tags, snapshots, citations
Postgres (articles.content = raw MDX, verbatim)
```

The web editor's server actions (`app/[publisher]/articles/actions.ts`) and
the API both call `createArticleCore` / `updateArticleCore` /
`deleteArticleCore`, so every write path produces revisions, refreshes the
`metadata` JSONB mirror, re-syncs tags/categories, snapshots published
versions, and tracks citations.

## API tokens

- Created at **Settings → API tokens** (`/settings/api-tokens`); raw token
  (`pst_...`) is shown once, only its sha256 hash is stored (`api_tokens`
  table, migration `drizzle/0018_api_tokens.sql`).
- `lib/api-auth.ts` resolves `Authorization: Bearer pst_...` to the same
  `SessionPayload` shape as cookie sessions, so `canEditContent` applies
  unchanged (email-verified requirement, org roles, root admin).
- Bearer-only — no cookie fallback — so CSRF does not apply to `/api/v1`.
- Soft revocation (`revokedAt`), optional expiry, throttled `lastUsedAt`.

## REST endpoints

All routes require edit rights on the publisher (even GETs — this is an
authoring API). Rate limit: 240 req/min per user. Content cap: 2 MB.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/me` | Token check; lists writable publishers. |
| GET | `/api/v1/publishers/:pub/articles` | Summaries + `contentHash` (sha256 of stored content). `?since=` optional. |
| GET | `/api/v1/publishers/:pub/articles/:slug` | Full raw MDX + `contentHash` (also the `ETag`). |
| POST | `/api/v1/publishers/:pub/articles` | `{ slug, title, summary?, content }` → 201. 409 `slug_exists`, 422 validation. |
| PUT | `/api/v1/publishers/:pub/articles/:slug` | Requires `If-Match: "<baseHash>"` (else 428). Stale base → **412** with `remoteContentHash`. Body `{ title?, summary?, content, editNote? }`; omitted title/summary are kept. |
| DELETE | `/api/v1/publishers/:pub/articles/:slug` | Same If-Match semantics; soft delete → 204. |
| GET | `/api/v1/publishers/:pub/books` | Read-only list. |
| GET | `/api/v1/publishers/:pub/books/:slug` | Ordered chapter list + `structureHash` (also the `ETag`). |
| PUT | `/api/v1/publishers/:pub/books/:slug` | Reorder / re-group chapters. Requires `If-Match: "<structureHash>"` (else 428); stale base → **412**; a changed chapter *set* → **409** (`chapter_set_mismatch`). Body `{ chapters: [{ articleSlug, partTitle }] }`. |

Book index files (`<publisher>/books/<slug>.md`) are editable: reorder the
chapter lines and move them under `## Part` headings, then `push`. **Only order
and part grouping sync** — adding or removing chapters (article creation,
cross-publisher visibility, internal-article deletion) stays in the web UI, and
a push that changed the chapter set is rejected with a clear message.

The optimistic-concurrency base is always the **server-reported**
`contentHash` from pull time — clients never recompute it from local files.

## ps-sync CLI (`cli/ps-sync`)

Sources live in `cli/ps-sync/src` (only dependency: `gray-matter`).

**Distribution — three ways, one bundle.** `cli/ps-sync/bundle.mjs`
esbuild-bundles the TypeScript sources (gray-matter inlined) into a single
self-contained ESM file that needs nothing but Node 18+:

1. **Site download** — `cli/ps-sync/build.mjs` (the app's `prebuild` script)
   writes `public/ps-sync.mjs` with the producing site's URL baked in, so every
   deploy serves a CLI matching its own API. A quickstart with the download link
   is on `/settings/api-tokens`:
   ```bash
   curl -O https://www.principiasynthesia.org/ps-sync.mjs
   node ps-sync.mjs init && node ps-sync.mjs pull
   ```
2. **npm** — `cli/ps-sync/package.json` (name `principia-sync`, bins `ps-sync`
   and `principia-sync`) publishes `dist/ps-sync.mjs` (built by
   `build-npm.mjs`, no baked server → `init` prompts). `prepublishOnly` runs
   the build; `npm pack` ships only the bundle + README.
   ```bash
   npm i -g principia-sync   # or: npx principia-sync init
   ps-sync init && ps-sync pull
   ```
3. **Dev** — against the repo checkout: `npx tsx cli/ps-sync/src/index.ts`.

Self-referencing hint messages adapt to the invocation (`node ps-sync.mjs …`
for the downloaded file, `ps-sync …` for the installed bin).

- `init` — prompts for server URL + token, validates via `/me`, writes
  `.ps-sync.json` (no secrets) and `.ps-sync/token` (gitignored). Token can
  also come from `PS_SYNC_TOKEN`.
- `pull` — writes `<publisher>/articles/<slug>.md`; overwrites only clean
  files; conflicts leave the local file untouched (`--write-conflicts` drops a
  `*.remote.md` beside it). Also refreshes read-only book index notes at
  `<publisher>/books/<slug>.md` — ordered chapter lists using relative
  markdown links by default, or `[[wikilinks]]` with `"links": "wikilink"` in
  `.ps-sync.json` for wikilink-native editors. `--no-books` skips.
- `push` — uploads locally modified tracked files with `If-Match`; 412 →
  reported as a conflict ("pull, merge, push again"). `--dry-run`;
  `--create` publishes untracked files (slug from filename, `article-`
  auto-prefixed; title from first `#` heading); `--delete` removes remotely
  what was deleted locally.
- `status` — table of modified / remote-changed / conflicts / new; exit 1 on
  conflicts.

### Round-trip design (editor-agnostic)

- **Identity:** pull injects one frontmatter key, `ps-id: <articleId>`.
  Markdown editors preserve unknown frontmatter keys, so files survive
  renames/moves and are re-linked by id. **Push strips `ps-id` textually**
  (byte-preserving the rest of the frontmatter) so the canonical stored
  content never contains it. `.ps-sync/state.json` maps each file to
  `{ articleId, baseHash, baseSemanticHash, remoteUpdatedAt }`.
- **Change detection:** some editors rewrite YAML formatting when metadata is
  edited through their UI (e.g. Obsidian's Properties panel turns flow arrays
  into block style), so byte comparison would show phantom changes.
  `semanticHash` (cli/ps-sync/src/content.ts) hashes the *parsed* frontmatter
  (normalized per `articleMetadataSchema` semantics, including unknown keys
  by value) plus the trimmed body — a pure YAML restyle hashes identically
  and is never pushed. Plain-text editors are unaffected either way.
- **Frontmatter safety:** if a local edit makes the frontmatter invalid
  against the server schema, the server would silently reset the article's
  metadata mirror to defaults. `push` detects this, warns, and skips the file
  unless `--allow-invalid-frontmatter` is passed.
- The MDX dialect (wikilinks `[[pub:type:slug|Label]]`, `<Cite/>`,
  `<DynamicAnimation/>`, `$$` math — see `docs/content.md`) passes through
  untouched: content is an opaque string end-to-end.
- Files are written as `.md` (not `.mdx`) by default so every markdown editor
  opens them; configurable via `extension` in `.ps-sync.json` (e.g. `mdx` for
  editors with MDX support).

## Tests

- `tests/lib/articles-write.test.ts` — write-core invariants and conflict
  preconditions.
- `tests/lib/api-auth.test.ts` — token generation/resolution.
- `tests/api/v1-articles-route.test.ts` — status-code matrix
  (401/403/404/409/412/422/428/201/204).
- `tests/cli/content.test.ts` — ps-id round-trip, reformat-stable semantic
  hashing (using Obsidian's YAML rewrite as the worst-case fixture),
  frontmatter validation.
