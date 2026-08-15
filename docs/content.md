# Content System

## MDX rendering

Article content is stored as raw MDX and rendered server-side with `next-mdx-remote/rsc`. Pipeline in `app/[publisher]/articles/[slug]/page.tsx`:

- `remark-math` + `rehype-katex` — LaTeX math
- `remark-gfm` — GitHub-flavored Markdown
- `remarkWikilinks` (`lib/remark-wikilinks.ts`) — `[[publisher:type:slug]]` → `/:publisher/:type/:slug`. Supported types: `articles`, `books`, `objects`. Optional label: `[[publisher:type:slug|Display text]]`. Unrecognised patterns are left as literal text.

- `remarkFencedEmbeds` (`lib/remark-fenced-embeds.ts`) — rewrites the two *rendering* fence languages into components before the highlighter sees them (see Fenced embeds below).
- `@shikijs/rehype` (`lib/code-highlight.ts`) — syntax highlighting for every other fence.

The plugin list, the component map (`buildArticleComponents`) and the body preparation all live in `lib/article-mdx.tsx`, shared by the published pages and the editor Preview.

MDX components available in articles:
- `<Embed slug="..." />` — renders any object or article by slug (see Embeds below).
- `<DynamicAnimation slug="..." />` — embeds a KAO animation iframe. `<Embed>` does the same thing for an animation object and is the form to reach for; this one stays for existing articles.
- `<Cite slug="publisher/article-slug" />` — inline citation reference; see the Internal Citation Linking section below.

### Fenced embeds

Two fence languages render instead of listing:

````
```mermaid
graph TD;
  A --> B;
```
````

Renders through the same `<DiagramRenderer>` a diagram object uses, in the site's own colours (`components/MermaidDiagram.tsx` feeds the page's CSS tokens to Mermaid's `base` theme).

````
```animation height=400
function Wave() {
  const canvas = document.getElementById("canvas");
  ...
}
```
````

Renders exactly like `<DynamicAnimation>` — same sandboxed iframe, same `window.theme`, same "first `function` declaration is the entry point" rule — for an animation that belongs to one article and does not need to exist as a reusable object. The document is built by `lib/animation-document.ts`, shared with the animation API route. `height=` is optional and defaults to `DEFAULT_ANIMATION_HEIGHT`.

Every other fence is syntax-highlighted (`cpp`, `ts`, `python`, …). Languages outside the eager set in `lib/code-highlight.ts` load on demand; an unknown one falls back to plain text rather than throwing. Two themes are emitted at once as CSS variables, and `app/globals.css` picks one per colour scheme.

### Embeds

`<Embed slug="…" />` renders another piece of this site's content in place. One tag for every type — the target's own type decides how it draws:

- an **animation** object → its canvas
- a **dataset** object → its table
- a **diagram** object → its diagram
- an **article** or a **book** → a card linking to it (not inlined prose: splicing a body in would double its headings in the TOC and make citation numbering ambiguous)

**Addressing.** The wikilink address is the form to reach for — it is what the "Copy embed tag" button emits, and the only one that names both the publisher and the kind:

```mdx
<Embed slug="publisher:objects:object-slug" />
<Embed slug="publisher:articles:article-slug" />
<Embed slug="publisher:books:book-slug" />
<Embed slug="publisher:books:book-slug:section-slug" />
```

The `[[…]]` brackets are optional, so a pasted "Copy wikilink" value works too. Two shorthands remain: a bare `slug="thing"` resolves against the embedding article's own publisher, and `slug="publisher/thing"` reaches across without naming a kind. A `publisher="…"` prop overrides whatever the address says.

Naming the kind is not just documentation — `publisher:articles:x` skips the object lookup entirely, so an article and an object sharing a slug are no longer ambiguous. Without a kind, objects win, since objects exist to be embedded and articles merely can be.

Anything the reader may not see renders the same "nothing to embed" notice as a slug that does not exist, so an embed never discloses that private content is there.

Resolution lives in `lib/embed-resolve.ts` and rendering in `components/EmbedBody.tsx`, both shared with the editor Preview (which resolves over `GET /api/publishers/[publisher]/embeds/[slug]` since it has no server React).

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

## Article editor (live preview + FrontmatterPanel)

`components/ContentEditor.tsx` is a single-panel CodeMirror 6 editor with
three modes (Ctrl/Cmd+E cycles Live → Source → Preview; segmented control in
the header; preference persisted in `localStorage["ps:editor-mode"]`, default
`live`). Live/Source reconfigure in place via a `Compartment`; Preview hides
the (still-mounted) CodeMirror view — so the document, cursor, scroll
position, and undo history all survive every mode switch. The text column is
a fixed `min(52rem, 100%)` measure with gutters hidden in all modes, so
switching never reflows the page.

- **Live Preview** (Obsidian-style, `lib/live-preview/`): markdown renders in
  place. Formatting markers are hidden and text is styled to match the public
  `.markdown-content` rules; the raw syntax is revealed wherever the selection
  intersects a node. Rich content renders as widgets: KaTeX math
  (`$…$`/`$$…$$`, client-side `katex.renderToString` — string templating, no
  eval, so the CSP posture below is unchanged), wikilink chips, and inline
  images. Everything else — fenced code, JSX like `<Cite/>`, tables, and the
  YAML frontmatter block — is deliberately left as syntax-highlighted source.
  Decorations are viewport-scoped and rebuilt only when the document, viewport,
  parse, or a relevant selection changes (O(visible nodes), never O(doc));
  widgets implement `eq()` and KaTeX output is cached per formula, so
  untouched content is never re-rendered. The document remains pure text —
  decorations are view-only.
- **Source**: plain syntax-highlighted markdown (the same dialect: markdown +
  `MarkdownMath` + `MarkdownWikilink`).

**Notion-style block affordances** (all keep the file plain markdown):

- **Slash menu** (`lib/live-preview/slash-menu.ts`): typing `/` at the start of
  a line (or after list/quote marks; ignored mid-sentence) opens a searchable
  block menu (headings, lists, to-do, quote, callout, toggle, code, divider,
  table, math, wikilink, columns) that inserts the block's markdown.
- **Turn-into** (`lib/live-preview/turn-into.ts`): `Mod-Alt-0/1/2/3/7/8/9/q`
  rewrites the current line(s) prefix to paragraph / headings / bullet /
  numbered / to-do / quote, preserving content and indentation.
- **Callouts** (`lib/remark-callouts.ts`): `> [!note] Title` GitHub/Obsidian
  alert syntax → a colored callout box (12+ types, optional title, `+`/`-`
  foldable). Registered in the article-page and `previewMdx` pipelines; the
  live editor tints callout lines by type. Degrades to a plain blockquote.
- **Toggles**: `<details><summary>` render natively through MDX
  (`allowDangerousHtml`), styled in `.markdown-content`.

  > Columns were prototyped via `remark-directive` but removed: directive
  > syntax hooks micromark at the parse level and fragments the colon-heavy
  > `[[pub:type:slug]]` wikilink syntax, breaking internal links. A colon-safe
  > columns implementation is deferred.
- **Preview**: the real thing — the document compiled through the `previewMdx`
  server pipeline and rendered read-only in `.markdown-content`, refreshed on
  every entry into the mode. Anything that can only run in a browser — a
  canvas, a Mermaid diagram, an `<Embed>` that has to be looked up — comes back
  from the server as an empty `[data-ps-embed]` element, and
  `components/PreviewEmbeds.tsx` mounts a React root rendering the *same*
  component the published page uses. Nothing is re-implemented as HTML here, so
  Preview and published output cannot drift.

Editor chrome theming lives in `lib/live-preview/theme.ts` (CSS custom
properties, so user themes and dark mode apply without JS); the live-preview
*typography* (`.cm-lp-*`) lives in `app/globals.css`, co-located with — and
value-identical to — the `.markdown-content` rules it must match.

The article edit/new pages embed a `FrontmatterPanel` (`"use client"`,
`forwardRef`) inside a collapsible `<details>`. Fields: Status, Tags,
Description, Canvas animation. Bidirectional sync:

- `FrontmatterPanel` change → `applyChange()` serialises the frontmatter block
  → `editorRef.current.replaceFrontmatter()` dispatches a change covering only
  `[0, frontmatterEnd)` — the body, cursor, and live-preview state are untouched.
- CodeMirror `onChange` → `frontmatterRef.current.syncFromMdx(val)` re-parses MDX → updates panel state (skips re-render when unchanged).

`ArticleEditorPanel` is the parent `"use client"` component that holds both refs and wires the sync.

**Public display:** `components/ArticleMetadata.tsx` (server component) renders at the top of article/chapter pages: updated-at date, status badge (hidden for `"published"`), tags as `/search?tags=<tag>` links, description.

## MDX compile check (editor)

The old split-editor Preview pane is gone (live preview renders in place).
`components/CheckMdxButton.tsx` remains the full-fidelity validation path: it
calls the `previewMdx` server action (`app/[publisher]/articles/actions.ts`),
which runs the full `unified` remark/rehype pipeline (including `remark-math`,
`rehype-katex`, `remark-gfm`, and `remarkWikilinks`) on the server and returns
serialised HTML. The button surfaces a ✓/✗ badge; clicking it opens a native
`<dialog>` with the compile error or the rendered output.

This design is intentional: running `next-mdx-remote`'s client-side `serialize()` in the browser calls `new Function()`, which violates the CSP `unsafe-eval` restriction when navigating client-side to the edit page (the nonce-based CSP header from the previous navigation is no longer in scope). Compiling on the server means the browser never evaluates dynamic code, so editor routes do not need `unsafe-eval`.

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
