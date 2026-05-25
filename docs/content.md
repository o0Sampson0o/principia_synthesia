# Content System

## MDX rendering

Article content is stored as raw MDX and rendered server-side with `next-mdx-remote/rsc`. Pipeline in `app/[publisher]/articles/[slug]/page.tsx`:

- `remark-math` + `rehype-katex` — LaTeX math
- `remark-gfm` — GitHub-flavored Markdown
- `remarkWikilinks` (`lib/remark-wikilinks.ts`) — `[[publisher:type:slug]]` → `/:publisher/:type/:slug`. Supported types: `articles`, `books`, `objects`. Optional label: `[[publisher:type:slug|Display text]]`. Unrecognised patterns are left as literal text.

MDX components available in articles:
- `<DynamicAnimation slug="..." />` — embeds a KAO animation iframe.
- `<Cite slug="publisher/article-slug" />` — inline citation reference; see the Internal Citation Linking section below.

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

## MDX preview (editor)

`components/Preview.tsx` (`"use client"`, `forwardRef`) renders the right-hand pane of the split editor. It does **not** run MDX compilation in the browser. Instead it calls the `previewMdx` server action (`app/[publisher]/articles/actions.ts`), which runs the full `unified` remark/rehype pipeline (including `remark-math`, `rehype-katex`, `remark-gfm`, and `remarkWikilinks`) on the server and returns serialised HTML. The client renders the result with `dangerouslySetInnerHTML`.

This design is intentional: running `next-mdx-remote`'s client-side `serialize()` in the browser calls `new Function()`, which violates the CSP `unsafe-eval` restriction when navigating client-side to the edit page (the nonce-based CSP header from the previous navigation is no longer in scope). Compiling on the server means the browser never evaluates dynamic code, so editor routes do not need `unsafe-eval`.

Preview has two modes: a fast synchronous path using `marked` for local markdown (no KaTeX, no wikilinks) that renders during typing, and the full server-side path that fires after a debounce. The `ref` exposed by `Preview` lets the parent (`ArticleEditorPanel`) call `preview.current.refresh()` to trigger an immediate full render (e.g. on initial load).

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

## Article version snapshots

Every time an article is saved with `status: "published"`, `lib/article-snapshots.ts` computes a SHA-256 hash of the content and inserts a row into `articleSnapshots` (deduped on `(articleId, contentHash)`, so saving identical content twice is a no-op). The `shortHash` (first 7 hex chars) is stored as a denormalised column for URL use.

**Serving a snapshot:** Visiting `/:publisher/articles/:slug?v=<shortHash>` causes the article page to resolve the matching snapshot and render its frozen content instead of the live article. The `SnapshotBanner` component is shown at the top of the page, indicating this is an archived version and linking back to the live article.

**Versions index:** `/:publisher/articles/:slug/versions` lists all snapshots for the article in chronological order. Each entry links to the `?v=<shortHash>` URL.

**Hash resolution:** `getSnapshotByShortHash(articleId, shortHash)` matches using a `LIKE` prefix query. If zero or more than one snapshot matches the prefix, it returns `null` (safer to 404 than guess on ambiguity).

## Citation generator (cite-this-article)

Every public article page shows a "Cite this article" button (`CiteButton.tsx`), which opens `CitationModal.tsx`. The modal offers four formats — APA 7th edition, MLA 9th edition, Chicago 17th edition, and BibTeX — with a copy-to-clipboard button for each.

Formatters live in `lib/citations.ts` (pure functions, no DB or server dependencies). The `CitationInput` type carries:
- `authorDisplayName`, `authorPublisherSlug`
- `title`
- `publishedAt` — `updatedAt` of the live article, or `snapshot.publishedAt` when on a versioned URL
- `url` — full canonical URL including `?v=…` when viewing a snapshot
- `versionHash` — the short hash, or `null` for the live article
- `accessedAt` — the request time

The BibTeX key is derived as `<authorLastName><firstSlugWord><year>` (all lowercased, non-alphanumeric chars stripped).

## Internal citation linking

The `<Cite slug="publisher/article-slug" />` MDX component creates a numbered, hyperlinked footnote reference to another article on the platform.

**Pipeline:**

1. `lib/citations-extract.ts` — regex extraction of all `<Cite slug="…" />` occurrences from raw MDX.
2. `lib/citations-sync.ts` — `syncArticleCitations(citingArticleId, mdx)` runs on every article save. It resolves each slug to an `articleId`, diffs the result against existing `articleCitations` rows, deletes removed rows, inserts added rows with a sequential `position` value, and returns `{ added, removed }` so the caller can send `"article_cited"` notifications for newly added citations. Unresolvable slugs and self-references are silently skipped. Duplicate `<Cite>` calls to the same target are deduplicated.
3. `lib/remark-cite-numbering.ts` — a remark plugin (`remarkCiteNumbering`) that runs during MDX compilation. It walks the AST for `<Cite>` JSX elements and injects `number`, `resolvedTitle`, and `resolvedHref` props derived from the `slugToNumber` and `resolved` maps passed as options. This keeps `Cite.tsx` a pure presentational component with no runtime DB calls.
4. `components/Cite.tsx` — renders the injected props as a superscript link (e.g., `[1]`).
5. `components/BibliographySection.tsx` — renders the full bibliography list at the bottom of the article, aggregating all `<Cite>` references in document order.

**Notification:** When `syncArticleCitations` returns newly added cited IDs, the article save action calls `notify(userId, "article_cited", payload)` for each cited article's author(s).

## Command palette

`components/CommandPalette.tsx` (client component) in the root layout. `Ctrl/Cmd+Shift+P` opens modal fuzzy-search over articles, books, and objects via `searchAll()` in `lib/search.ts`. Runs three parallel case-insensitive `ILIKE` queries, up to 8 results per category. Each result includes `publisherSlug` for link construction. Internal articles and (for non-root-admin) private resources are excluded.
