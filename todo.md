# Todo

## Active Bugs

### KaTeX font rendering broken in PDF export on Vercel

Math in generated PDFs renders with wrong/broken fonts on Vercel.

**What's been tried (all failed/partially fixed)**

1. **Base64 data URI inlining** — Worked locally, failed on Vercel (fallback to system fonts).
2. **Build-time generated CSS** — Statically traced by NFT, worked locally, failed on Vercel.
3. **SVG Math (EPUB)** — Initially reported broken (not visible). **FIXED**: Corrected `html.clear()` order in `lib/epub.ts`, added `space: "svg"` to HAST parser, and updated `mdxSanitizeSchema` to allow SVG tags/attributes.
4. **PDF Render Adjustments** — **FAILED**: Added `page.emulateMedia({ media: 'screen' })` and a 500ms rendering delay. Math still renders in fallback serif fonts on Vercel.

**Data points**

- **Media Type Mismatch (Hypothesis 1)**: `emulateMedia({ media: 'screen' })` did not resolve the font issue on Vercel.
- **Timing (Hypothesis 2)**: 500ms delay was insufficient or the issue is not timing-related.
- **Sanitization (Hypothesis 5)**: `mdxSanitizeSchema` fix ensures SVG math (if used as fallback) will not be stripped.
- **EPUB State (Hypothesis 6)**: `html.clear()` order fix successfully restored SVG math visibility in EPUBs.

**Next steps**

- **SVG-based Math for PDF (Recommended)**: Switch `render-book-html.ts` to use `rehypeMathSvg` instead of `rehypeKatex` — this was successfully verified for EPUBs.
- **Enhanced Logging**: If still failing, enable Playwright console/request logging in the route to see specific font fetch errors.

**Files involved**

- `lib/pdf/render-book-html.ts` — `getKatexCss()` returns `KATEX_CSS` from generated file
- `lib/pdf/katex-css.generated.ts` — auto-generated, checked into git
- `scripts/generate-katex-css.mjs` — regeneration script
- `app/api/curriculum/[book]/export/pdf/route.ts` — PDF route with `document.fonts.ready`
- `tests/api/curriculum-pdf-route.test.ts` — mock includes `evaluate` for `document.fonts.ready`

---

## Roadmap

> Core identity: **structured wiki with native canvas animations.**
> Do not build: graph view, real-time collaboration, general plugin system, Notion databases.
> Re-evaluate priorities every 3 months.

---

### Phase A — Foundation & Monetization (Week 1–2)

- [ ] Create a Stripe account (https://stripe.com)
- [ ] Set up GitHub Sponsors (0% fees on individual sponsorships)
- [x] Add "Support this project" button linking to GitHub Sponsors (footer + README)
- [ ] Buy a custom domain (~$10/yr at Cloudflare/Namecheap — signals professionalism)
- [x] Enable Vercel Analytics or Plausible (track signups and conversions)
- [ ] Implement hosted SaaS tiers + Stripe Checkout
  - Add `user_id` FK to articles and books
  - [x] Create `/pricing` page with tier comparison table
  - Integrate Stripe Checkout (subscription)
  - Add webhook to update user entitlements after payment
  - Gate Pro/Team features behind middleware
- [ ] Launch post on Hacker News, Reddit (`r/selfhosted`, `r/opensource`, `r/javascript`), Dev.to
- [ ] Reach out to 10–20 educators / technical writers — offer free Pro for feedback
- [ ] Get first paying customer (even $1)

**Suggested tiers:**

| Tier | Price/mo | Features |
|------|----------|----------|
| Free | $0 | 3 articles, 1 book, public read-only, basic animations |
| Pro | $9 | Unlimited articles & books, PDF/EPUB export, custom theme, animations library |
| Team | $29 | All Pro + collaboration, permissions, audit logs, priority support |

---

### Phase B — Tier 1 Features (Weeks 3–10)

- [x] **PWA / Read-only offline caching** _(3–5 days)_
  Use `next-pwa` or Workbox. Cache articles, books, and assets. Disable editing offline with graceful error.
- [x] **Reorderable article sections** _(1 week)_
  Use `@dnd-kit/sortable`. Store section order in article frontmatter.
- [x] **Book → offline HTML/JS bundle export** _(1–2 weeks)_
  Export route that generates static HTML/CSS/JS for a book + its animations, zipped and served.
- [x] **Visual permission editor** _(3–5 days)_
  Drag-and-drop UI to set read/write/admin at book or article level.
- [ ] **Print-on-demand marketplace integration** _(2–3 weeks)_
  Integrate with Lulu Direct or Printful. Send formatted PDF (with canvas screenshots) and take ~20% commission.

---

### Phase C — Evaluate & Pivot (Month 3)

- [ ] Collect structured user feedback
- [ ] Review monetization metrics (MRR, free→paid conversion rate)
- [ ] Decide whether Tier 2 features are worth building

---

### Phase D — Tier 2 Features (Months 4–9, if traction)

- [ ] **Knowledge as an Object (KAO) schema — primitive** _(2–4 weeks)_
  New `objects` table with `type` (animation, dataset, diagram) and `content` (JSON). Embed via `[[object:pendulum]]` wikilink syntax.
- [ ] **Animation plugin registry** _(3–6 weeks)_
  Scan `plugins/animations/` for manifests. Reuse existing iframe sandbox. Add UI to install community animations from a gallery.
- [ ] **Local-first bundle as sync bridge** _(2 weeks)_
  Export book as a folder with JSON + assets. User drops it into Dropbox/iCloud. On import, detect changes and merge (last-write-wins).
- [ ] **Infinite canvas + native pen input** _(1–2 months)_
  New "Canvas Book" type — infinite zoom/pan, pen-optimized. Offer as opt-in beta.

---

### Phase E — Tier 3 / Experimental (Year 2+, only if large user base)

- [ ] **AI as intelligent partner (local graph RAG)** _(3–6 months)_
  Build as an optional paid add-on. Revolutionary but unproven at this stage.
- [ ] **Two-way AI agent collaboration via MCP** _(4–6 months)_
  Let AI agents read/update the wiki automatically.
- [ ] **Full offline editing with sync queues** _(2–3 months)_
  Only if users demand Notion-level offline editing.

---

### Open Core — Paid Features for Self-Hosted

- [ ] Move paid features behind a config flag (`config.features.PDF_EXPORT`, etc.)
- [ ] Build license key validation (JWT + database lookup)
- [ ] Define commercial license for: PDF/EPUB export, SSO (SAML/OAuth), audit logs, advanced RBAC, priority support SLA
- [ ] Offer support contracts ($500/month for self-hosted enterprise)

---

### Services & Consulting (On Demand)

- [ ] Custom migration (Notion/Obsidian → Principia Synthesia) — $2k–$5k/project
- [ ] Enterprise training workshops — $1k/day
- [ ] White-label deployment — $10k–$20k one-time

---

## Final Checklist

- [ ] Stripe integration works (test transaction succeeded)
- [ ] At least one paid subscription active
- [ ] GitHub Sponsors has at least one sponsor
- [ ] Custom domain live (or clear plan after first $100 MRR)
- [x] PWA enabled — articles cache offline
- [x] Users can reorder article sections
- [x] Book export to offline bundle works
- [x] Permissions editor UI complete
- [ ] Print-on-demand integration ready
