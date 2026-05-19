# Content System

## MDX rendering

Article content is stored as raw MDX and rendered server-side with `next-mdx-remote/rsc`. Pipeline in `app/[publisher]/articles/[slug]/page.tsx`:

- `remark-math` + `rehype-katex` — LaTeX math
- `remark-gfm` — GitHub-flavored Markdown
- `remarkWikilinks` (`lib/remark-wikilinks.ts`) — `[[publisher:type:slug]]` → `/:publisher/:type/:slug`. Supported types: `articles`, `books`, `objects`. Optional label: `[[publisher:type:slug|Display text]]`. Unrecognised patterns are left as literal text.

The only MDX component available in articles is `<DynamicAnimation slug="..." />`.

**remark-math@6 display math:** Requires multi-line delimiters:
```
$$
E = mc^2
$$
```
Single-line `$$...$$` is parsed as **inline** math. This applies to all MDX content and seed data.

**KaTeX CSS:** Imported globally via `@import "katex/dist/katex.min.css"` at the top of `app/globals.css`. Additional rules for `.markdown-content .katex-display` ensure display math is centred.

## Frontmatter & article metadata

Article MDX is stored with a leading `---` YAML block. The full string (frontmatter + body) is in `articles.content`; the parsed result is also in `articles.metadata` (JSONB) on every save.

**`ArticleMetadata` type** (`lib/validations.ts`, `articleMetadataSchema`):
- `status` — `"draft"` | `"review"` | `"published"` | `"archived"`. Defaults to `"published"`.
- `tags` — freeform string array (max 20 tags, each max 50 chars).
- `description` — string, max 300 chars.
- `canvas` — slug of a KAO animation to auto-embed at the top of the article, or `null`.

**`lib/frontmatter.ts`:**
- `parseFrontmatter(mdx)` — extracts `---` block with `gray-matter`, validates, returns `{ metadata, body }`.
- `serializeFrontmatter(metadata, body)` — reconstructs MDX with the YAML block prepended.

**Round-trip:** Every save calls `parseFrontmatter` and writes the result into `articles.metadata`. Public pages call `parseFrontmatter` to strip YAML before passing `body` to `<MDXRemote>`.

**Auto-canvas embedding:** If `metadata.canvas` is non-empty, `<DynamicAnimation slug={metadata.canvas} />` is prepended to the MDX body before rendering.

**Status filtering:** Non-admin sessions see only `status: "published"` articles. Draft/review/archived are excluded from homepage, categories, search, sitemap, and command palette. Admin sessions see all statuses.

**Tag search:** `/search` accepts `?tags=<comma-separated>`, adding a JSONB array-containment check against `articles.metadata`.

## Article editor (FrontmatterPanel + bidirectional sync)

The article edit/new pages embed a `FrontmatterPanel` (`"use client"`, `forwardRef`) inside a collapsible `<details>`. Fields: Status, Tags, Description, Canvas animation. Bidirectional sync:

- `FrontmatterPanel` change → `applyChange()` re-serialises frontmatter → `editorRef.current.setValue()` updates CodeMirror.
- CodeMirror `onChange` → `frontmatterRef.current.syncFromMdx(val)` re-parses MDX → updates panel state (skips re-render when unchanged).

`ArticleEditorPanel` is the parent `"use client"` component that holds both refs and wires the sync.

**Public display:** `components/ArticleMetadata.tsx` (server component) renders at the top of article/chapter pages: updated-at date, status badge (hidden for `"published"`), tags as `/search?tags=<tag>` links, description.

## Article section reordering

`lib/article-sections.ts`:
- `parseArticleSections(mdx)` — splits on `\n## ` into `Section[]` objects (`id`, `heading`, `body`). The pre-`##` block is always included as `id: "preamble"`. Heading IDs are kebab-slugified; duplicates get `-2`, `-3` suffixes.
- `reconstructMdx(preamble, sections)` — joins preamble + ordered sections back into valid MDX.

`SectionReorderPanel` (`"use client"`, `@dnd-kit/sortable`) on the edit page: preamble is pinned non-draggable, `##` sections are draggable cards. Fewer than 2 draggable sections shows empty-state. On drop, `reconstructMdx` updates local state immediately, then `updateArticleContent` is called in `startTransition`.

`updateArticleContent` does **not** create a revision entry — reordering is a structural change, not a content edit.

## Revision history

`components/RevisionHistory.tsx` (`"use client"`) on the article edit page inside a collapsible `<details>`. Props: `publisherSlug`, `articleId`, `{ id, editNote, editedAt }[]`.

Clicking "Restore" calls `restoreRevision` via `useTransition` with `FormData` containing `revisionId`, `articleId`, `publisherSlug`. The action saves the current content as a new revision first, then restores the selected one.

Dates use `Intl.DateTimeFormat` with `timeZone: "UTC"` and are populated in `useEffect` to avoid SSR/client hydration mismatches.

## Internal articles

Internal articles belong exclusively to one book and are not discoverable outside it.

- `articles.isInternal = true`, `articles.parentBookId` (FK → `books.id`) set on creation.
- Created atomically with a `curriculumEntries` row via `createInternalArticle()`.
- Only accessible at `/:publisher/books/[bookSlug]/[chapter]`. Chapter route verifies `article.parentBookId === bookRow.id`.
- Excluded from search, category listings, homepage, sitemap, and command palette.
- Removing a curriculum entry for an internal article permanently deletes the article. Removing an entry for a regular article only removes the entry row.
- Deleting the book cascades to entries; internal articles are deleted via the `parentBookId` cascade.
- `updateArticle()` and `restoreRevision()` redirect to `/:publisher/books/[bookSlug]/[slug]` after saving.

**Cross-publisher entries:** The chapter page resolves the article via `curriculumEntries JOIN articles` filtered by `bookId` and slug — not by the book owner's publisher. This allows a book to include articles from a different publisher.

## Command palette

`components/CommandPalette.tsx` (client component) in the root layout. `Ctrl/Cmd+Shift+P` opens modal fuzzy-search over articles, books, and objects via `searchAll()` in `lib/search.ts`. Runs three parallel case-insensitive `ILIKE` queries, up to 8 results per category. Each result includes `publisherSlug` for link construction. Internal articles and (for non-root-admin) private resources are excluded.
