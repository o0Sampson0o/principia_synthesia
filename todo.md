# Todo

## BUG: KaTeX font rendering broken in PDF export on Vercel

Math in generated PDFs renders with wrong/broken fonts on Vercel.

### What's been tried (all failed/partially fixed)

1. **Base64 data URI inlining** — Worked locally, failed on Vercel (fallback to system fonts).
2. **Build-time generated CSS** — Statically traced by NFT, worked locally, failed on Vercel.
3. **SVG Math (EPUB)** — Initially reported broken (not visible). **FIXED**: Corrected `html.clear()` order in `lib/epub.ts`, added `space: "svg"` to HAST parser, and updated `mdxSanitizeSchema` to allow SVG tags/attributes.
4. **PDF Render Adjustments** — **APPLIED**: Added `page.emulateMedia({ media: 'screen' })` and a 500ms rendering delay in the PDF route to force correct font loading on Vercel.

### Data points

- **Media Type Mismatch (Hypothesis 1)**: Added `emulateMedia({ media: 'screen' })` to `app/api/curriculum/[book]/export/pdf/route.ts`.
- **Timing (Hypothesis 2)**: Added 500ms sleep after `document.fonts.ready`.
- **Sanitization (Hypothesis 5)**: Found that `mdxSanitizeSchema` was missing SVG tags, which could cause silent stripping if sanitization happened after SVG generation. Fixed in `lib/mdx-sanitize.ts`.
- **EPUB State (Hypothesis 6)**: Found that `html.clear()` was called before extracting the SVG string in `lib/epub.ts`, potentially resulting in empty output. Fixed.

### Next steps to investigate

- **SVG-based Math for PDF**: If KaTeX fonts are still broken on Vercel after the media/delay fix, switch `render-book-html.ts` to use `rehypeMathSvg` instead of `rehypeKatex`. This bypasses fonts entirely.
- **Enhanced Logging**: If still failing, enable Playwright console/request logging in the route to see specific font fetch errors.

### Files involved

- `lib/pdf/render-book-html.ts` — `getKatexCss()` returns `KATEX_CSS` from generated file
- `lib/pdf/katex-css.generated.ts` — auto-generated, checked into git
- `scripts/generate-katex-css.mjs` — regeneration script
- `app/api/curriculum/[book]/export/pdf/route.ts` — PDF route with `document.fonts.ready`
- `tests/api/curriculum-pdf-route.test.ts` — mock includes `evaluate` for `document.fonts.ready`
