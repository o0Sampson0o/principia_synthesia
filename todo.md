# Todo

## BUG: KaTeX font rendering broken in PDF export on Vercel

Math in generated PDFs renders with wrong/broken fonts on Vercel.

### What's been tried (all failed/partially fixed)

1. **Base64 data URI inlining** — Worked locally, failed on Vercel (fallback to system fonts).
2. **Build-time generated CSS** — Statically traced by NFT, worked locally, failed on Vercel.
3. **SVG Math (EPUB)** — Initially reported broken (not visible). **FIXED**: Corrected `html.clear()` order in `lib/epub.ts`, added `space: "svg"` to HAST parser, and updated `mdxSanitizeSchema` to allow SVG tags/attributes.
4. **PDF Render Adjustments** — **FAILED**: Added `page.emulateMedia({ media: 'screen' })` and a 500ms rendering delay. Math still renders in fallback serif fonts on Vercel.

### Data points

- **Media Type Mismatch (Hypothesis 1)**: `emulateMedia({ media: 'screen' })` did not resolve the font issue on Vercel.
- **Timing (Hypothesis 2)**: 500ms delay was insufficient or the issue is not timing-related.
- **Sanitization (Hypothesis 5)**: `mdxSanitizeSchema` fix ensures SVG math (if used as fallback) will not be stripped.
- **EPUB State (Hypothesis 6)**: `html.clear()` order fix successfully restored SVG math visibility in EPUBs.

### Next steps to investigate

- **SVG-based Math for PDF (Recommended)**: Since font loading in Chromium on Vercel is consistently unreliable, the definitive fix is to switch `render-book-html.ts` to use `rehypeMathSvg` instead of `rehypeKatex`. This was successfully fixed and verified for EPUBs.
- **Enhanced Logging**: If still failing, enable Playwright console/request logging in the route to see specific font fetch errors.

### Files involved

- `lib/pdf/render-book-html.ts` — `getKatexCss()` returns `KATEX_CSS` from generated file
- `lib/pdf/katex-css.generated.ts` — auto-generated, checked into git
- `scripts/generate-katex-css.mjs` — regeneration script
- `app/api/curriculum/[book]/export/pdf/route.ts` — PDF route with `document.fonts.ready`
- `tests/api/curriculum-pdf-route.test.ts` — mock includes `evaluate` for `document.fonts.ready`
