# Book Export: PDF, EPUB, Bundle, and Sync

Any curriculum book can be downloaded in several formats. All export routes are
scoped to a publisher and require that the requesting user can view the book
(access-controlled via `canView` from `lib/access.ts`).

| Format | Route |
|--------|-------|
| PDF    | `GET /api/publishers/[publisher]/books/[slug]/export/pdf`    |
| EPUB   | `GET /api/publishers/[publisher]/books/[slug]/export/epub`   |
| Bundle | `GET /api/publishers/[publisher]/books/[slug]/export/bundle` |
| Sync   | `GET /api/publishers/[publisher]/books/[slug]/export/sync`   |

All routes return 404 if the publisher or book does not exist or has no
curriculum entries.

---

## PDF export

### How it works

1. The route resolves the publisher slug to `ownerType`/`ownerId` via the
   `publishers` table, then looks up the `books` row.
2. Access is checked with `canView({ type: "book", ... }, session)` — private
   books return 404 for unauthenticated or ungranteed users. The PDF/EPUB
   features must also be enabled via license or env flag (see Open Core flags).
3. All `curriculumEntries` for the book (joined to `articles`) are loaded,
   ordered by `position`.
4. A SHA-256 content hash is computed from the book title and every entry's
   position, part title, article title, and article content. The hash is
   checked against the `pdfCaches` table (`bookId` FK) — a matching hash
   returns the stored PDF immediately, skipping Chromium entirely.
5. On cache miss, `renderBookHtml()` (`lib/pdf/render-book-html.ts`) converts
   each chapter's MDX content to HTML and assembles a full HTML document
   containing:
   - A cover page with the book title.
   - A table of contents listing all chapters (with part headings where set).
   - Each chapter on its own page, with part label and chapter title in a
     styled header.
6. The HTML document has two `<style>` blocks inlined in `<head>`:
   - KaTeX CSS (read from `node_modules/katex/dist/katex.min.css` at request
     time).
   - Print CSS (`@page` margins, serif body font, heading sizes, code blocks,
     tables, `.katex-display` centering, and all chapter/TOC layout classes).
7. Headless Chromium is launched via Playwright. On **Vercel** the Chromium
   binary is downloaded from the npm registry on cold start (extracted to
   `/tmp/chromium-bin` and inflated by `@sparticuz/chromium`). On warm start
   the already-inflated `/tmp/chromium` is reused. **Locally** Playwright uses
   the system or cached browser directly.
8. The HTML is fed to `page.setContent()` (waiting for `networkidle`), then
   `page.pdf({ format: 'A4', printBackground: true })` is called.
9. The resulting PDF buffer is stored in `pdfCaches` (old cache entries for the
   same book are replaced) and streamed back as `application/pdf` with
   `Content-Disposition: attachment; filename="<book-slug>.pdf"`.

Any subsequent request with the same book state (same articles, same ordering,
same titles) hits the cache and returns instantly.

### MDX content pipeline

Each chapter's content field goes through:

```
remarkParse → remarkMath → remarkGfm → remarkRehype
  → rehypeKatex → rehypeSanitize → rehypeStringify
```

Math is typeset via KaTeX running inside Chromium, so display is identical to
the web view.

### What gets stripped

Before the unified pipeline runs, `cleanMdx()` pre-processes the raw MDX string:

- **Wikilinks** (`[[publisher:type:slug]]`, etc.) — replaced with their display
  text (the label, or the last slug segment). The links themselves are not
  meaningful in a static document.
- **JSX components** — self-closing tags (`<ComponentName />`) and paired tags
  (`<ComponentName>…</ComponentName>`) whose tag name starts with an uppercase
  letter are removed entirely. This covers `<DynamicAnimation />` and any other
  custom MDX components. Their content does not appear in the PDF.

`rehypeSanitize` then strips `<script>`, `<iframe>`, `<form>`, and other unsafe
elements from the resulting HTML.

### Output characteristics

- Page size: A4 (210 × 297 mm), 2.5 cm margins on all sides.
- Body font: Georgia / Times New Roman, 11 pt, line-height 1.6.
- Code: Courier New, 9 pt, light gray background.
- Every chapter starts on a new page (`page-break-before: always`).
- `Cache-Control: no-store` — client-side caching is disabled; server-side
  caching via the `pdfCaches` database table (content-hash-based invalidation)
  avoids regenerating PDFs when the book state hasn't changed.

---

## EPUB export

### How it works

1. Publisher and book are resolved the same way as the PDF route.
2. Access and feature-flag checks are identical.
3. `buildEpub()` (`lib/epub.ts`) converts each chapter's MDX to HTML and
   passes the chapter list to `epub-gen-memory`, which assembles a valid EPUB3
   archive.
4. The buffer is returned as `application/epub+zip` with
   `Content-Disposition: attachment; filename="<book-slug>.epub"`.

### MDX content pipeline

Each chapter goes through the same `cleanMdx()` pre-processing as the PDF
pipeline (wikilinks and uppercase JSX components are stripped), then:

```
remarkParse → remarkMath → remarkGfm → remarkRehype
  → rehypeSanitize → rehypeMathSvg → rehypeStringify
```

Note that `rehypeKatex` is **not** used here. Instead, a custom rehype plugin
`rehypeMathSvg` handles math after sanitization.

### Math rendering: MathJax SVG

`rehypeMathSvg` is defined in `lib/epub.ts`. It walks the hast tree and replaces
math nodes with inline SVG generated by MathJax (`mathjax-full`, `liteAdaptor`,
`fontCache: 'none'`):

- **Inline math** — `<code class="math-inline">` nodes are replaced with a bare
  `<svg>` element inline in the surrounding text.
- **Display math** — `<pre><code class="math-display">` blocks are replaced with
  `<div style="text-align:center;margin:0.75em 0;">` wrapping the SVG.

MathJax is initialised lazily and reused across all chapters in a single request.
If MathJax fails to convert an expression, the raw LaTeX source is left in place
rather than crashing the export.

SVG was chosen over MathML because Kindle does not support MathML, while SVG is
mandatory in EPUB3 and is rendered correctly by Kindle, Apple Books, and Thorium.

### What gets stripped

The same wikilinks and JSX component stripping described in the PDF section
applies here. `rehypeSanitize` uses `mdxSanitizeSchema` (`lib/mdx-sanitize.ts`),
which allows the full set of HTML elements needed for KaTeX/MathJax output but
strips scripts, iframes, and forms.

The EPUB does not include a cover page or table of contents section in the HTML
chapters; `epub-gen-memory` generates its own TOC from the chapter title list.

### Output characteristics

- Format: EPUB3 (`application/epub+zip`).
- Author defaults to "Principia Synthesia" if not provided.
- A small CSS block is embedded in the EPUB:
  - `svg { max-width: 100%; }` — prevents wide math formulas from overflowing.
  - Basic typographic rules for links, part headings, and horizontal rules.
- `Cache-Control: no-store`.

---

## Bundle export

`GET /api/publishers/[publisher]/books/[slug]/export/bundle` returns a `.zip`
file (`Content-Type: application/zip`,
`Content-Disposition: attachment; filename="<bookSlug>-bundle.zip"`).

Access is controlled via `canView` — unauthenticated users without a grant
receive a 404. Max function duration is 60 seconds.

The bundle is built by `lib/bundle/build-book-bundle.ts` using JSZip. Contents:

- `chapters/ch-NNN-<slug>.html` — one self-contained HTML page per chapter.
  `<DynamicAnimation>` tags are replaced with inline `<canvas>` + `<script>`
  blocks before MDX processing, so animations run without the app server. Each
  page links to the previous/next chapter file.
- `index.html` — table of contents with an ordered chapter list.
- `styles.css` — standalone screen stylesheet (Georgia body font, system-ui
  headings) that also embeds `PRINT_CSS` from `lib/pdf/render-book-html.ts`.
- `router.js` — small IIFE that maps `ArrowRight`/`ArrowLeft` keys to
  next/previous chapter links.
- `manifest.json` — JSON metadata (title, bookSlug, generatedAt, chapter file
  list).

`mdxToHtml`, `cleanMdx`, and `PRINT_CSS` are re-exported from
`lib/pdf/render-book-html.ts` and shared with the bundle builder.

---

## Sync export and import

`GET /api/publishers/[publisher]/books/[slug]/export/sync` — root-admin-only
(returns 401 for non-root-admin sessions), returns a zip file
`<bookSlug>-sync.zip` built by `lib/sync/build-sync-bundle.ts` (JSZip).
Contents:

- `book.json` — manifest: `bookSlug`, `bookTitle`, `exportedAt`, and a
  `chapters` array (`slug`, `title`, `partTitle`, `position`, `isInternal`,
  `updatedAt`).
- `chapters/<slug>.mdx` — raw MDX content of each chapter, ordered by
  position.

**Import:** The `importSyncBundle` server action — root-admin-only, accepts a
zip upload (25 MB cap), validates `bookSlug` matches the URL param, then runs a
per-chapter last-write-wins merge: if the zip chapter's `updatedAt >= DB
article's updatedAt`, `articles.content` and `articles.updatedAt` are updated;
otherwise the chapter is skipped. Returns `{ updated, skipped }`. Never creates
new articles; never modifies metadata (slug, title, `isInternal`,
`parentBookId`).

The sync UI lives at `/:publisher/books/[bookSlug]/sync` — a server component
with a download link and a file upload form.

---

## Shared content processing details

Both PDF and EPUB pipelines use the same `mdxSanitizeSchema` from
`lib/mdx-sanitize.ts`. The schema allows inline styles and class names
(required by KaTeX and MathJax SVG output), GFM table elements, and a broad
set of standard HTML elements, while stripping anything executable or
form-related.

Neither pipeline has access to the live site's theme colors. PDFs use a fixed
black-on-white print stylesheet; EPUBs use the reader application's own theme.

---

## Open Core feature flags

PDF, EPUB, and bundle exports are gated by `lib/config.ts` feature flags
(`PDF_EXPORT`, `EPUB_EXPORT`, `BUNDLE_EXPORT`). Each flag is enabled by setting
the corresponding env var to `"true"`, or by providing a valid license JWT via
`lib/license.ts` whose `features` array includes the feature name. A disabled
feature returns 403.
