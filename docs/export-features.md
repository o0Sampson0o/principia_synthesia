# Exports & Feature Flags

## Open Core feature flags

`lib/config.ts` exports `config.features` with three boolean flags: `PDF_EXPORT`, `EPUB_EXPORT`, `BUNDLE_EXPORT`. Each is enabled by setting an env var of the same name to `"true"`.

`lib/license.ts` extends this with JWT-based license keys (jose, HS256, signed with `LICENSE_SECRET`):
- `isValidLicense(key)` — verifies JWT signature and expiry; returns decoded payload or `null`.
- `featureEnabled(feature, license?)` — true if the env flag is set **or** the license payload's `features` array includes the feature name.
- `getLicenseFromRequest(req)` — reads `x-license-key` header or falls back to `LICENSE_KEY` env var.

The three export routes call `featureEnabled` after `canView()`; return 403 if the feature is not enabled. The book TOC page hides download links when the feature is disabled.

## PDF export

`GET /api/publishers/[publisher]/books/[slug]/export/pdf`

1. SHA-256 content hash checked against `pdfCaches` (keyed by `bookId`) — cache hit returns stored PDF immediately.
2. On miss: `lib/pdf/render-book-html.ts` converts each chapter's MDX to HTML via: remark-parse → remark-math → remark-gfm → remark-rehype → rehype-katex → rehype-sanitize → rehype-stringify. Assembles a full HTML document with inlined KaTeX CSS, cover page, and TOC.
3. Playwright (headless Chromium) renders HTML → `page.pdf({ format: 'A4' })`.
4. On Vercel: `@sparticuz/chromium` downloads the binary on cold start (not bundled) to stay within the 50 MB Hobby plan limit. Extracted to `/tmp/chromium`.
5. Result stored in `pdfCaches` and served.

## EPUB export

`GET /api/publishers/[publisher]/books/[slug]/export/epub`

EPUB3 via `epub-gen-memory`. Math rendered to inline SVG using MathJax (`mathjax-full`, liteAdaptor, `fontCache: 'none'`) via the `rehypeMathSvg` rehype plugin. Inline math → `<svg>` elements; display math → `<div style="text-align:center">` wrapping SVG. Works in Kindle, Apple Books, and Thorium.

## Offline bundle export

`GET /api/publishers/[publisher]/books/[slug]/export/bundle`

Returns `<bookSlug>-bundle.zip` (`Content-Type: application/zip`). Access-controlled via `canView()`. Max function duration: 60 seconds.

Built by `lib/bundle/build-book-bundle.ts` (JSZip):
- `chapters/ch-NNN-<slug>.html` — self-contained HTML per chapter. `<DynamicAnimation>` tags replaced with inline `<canvas>` + `<script>` blocks so animations run without the app server. Each page links to previous/next chapter.
- `index.html` — table of contents.
- `styles.css` — standalone stylesheet (Georgia body font, system-ui headings) + `PRINT_CSS` from `lib/pdf/render-book-html.ts`.
- `router.js` — IIFE mapping `ArrowRight`/`ArrowLeft` to chapter navigation.
- `manifest.json` — title, bookSlug, generatedAt, chapter file list.

`mdxToHtml`, `cleanMdx`, and `PRINT_CSS` are re-exported from `lib/pdf/render-book-html.ts` and shared with the bundle builder.

## Local-first sync bridge

**Export:** `GET /api/publishers/[publisher]/books/[slug]/export/sync` — requires edit rights (401 otherwise). Returns `<bookSlug>-sync.zip` (JSZip, `lib/sync/build-sync-bundle.ts`):
- `book.json` — manifest: `bookSlug`, `bookTitle`, `exportedAt`, `chapters[]` (`slug`, `title`, `partTitle`, `position`, `isInternal`, `updatedAt`).
- `chapters/<slug>.mdx` — raw MDX per chapter, ordered by position.

**Import:** `importSyncBundle` server action (`app/[publisher]/books/[bookSlug]/sync/actions.ts`) — requires edit rights, accepts zip upload (25 MB cap), validates `bookSlug` matches URL param, runs per-chapter last-write-wins merge (zip `updatedAt >= DB updatedAt` → update; otherwise skip). Returns `{ updated, skipped }`. Never creates new articles; never modifies metadata.

**UI:** `/:publisher/books/[bookSlug]/edit` — download link + `SyncImportForm.tsx` (`"use client"`, `useActionState`).

**Validation schemas:** `syncBundleChapterSchema`, `syncBundleManifestSchema` in `lib/validations.ts`.

No revision rows created on merge (follows `updateArticleContent` precedent).

## Book snapshots

`snapshotBook()`, `listBookSnapshots()`, `restoreBookSnapshot()` server actions in `app/[publisher]/books/actions.ts`. Point-in-time captures of a book's curriculum structure. Stores each entry's position, part-title, and optionally article content. UI at `/:publisher/books/[bookSlug]/edit` (snapshots panel inline).
