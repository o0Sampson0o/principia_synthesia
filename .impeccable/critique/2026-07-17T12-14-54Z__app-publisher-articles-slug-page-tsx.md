---
target: article reading page
total_score: 25
p0_count: 1
p1_count: 3
timestamp: 2026-07-17T12-14-54Z
slug: app-publisher-articles-slug-page-tsx
---
Method: dual-agent (A: a2b88dc6b8340ece2 · B: a052272f9df86562f)

# Critique — Article reading page (`app/[publisher]/articles/[slug]/page.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good pending states; no loading UI despite sequential-query TTFB |
| 2 | Match System / Real World | 3 | "Fork (sign in)" is git jargon; "Unknown article: {slug}" leaks internals |
| 3 | User Control and Freedom | 3 | Snapshot escape + reply Cancel exist; no undo anywhere |
| 4 | Consistency and Standards | 1 | Four end-matter sections, three header grammars; nonexistent `themed-btn-secondary`; hardcoded ambers |
| 5 | Error Prevention | 2 | Comment Delete and "Mark as verified" fire irreversibly, no confirm |
| 6 | Recognition Rather Than Recall | 3 | Breadcrumb doesn't read as a link; "…and N more forks" is a dead end |
| 7 | Flexibility and Efficiency | 3 | 15-token theming exceptional; no TOC/position memory for long articles |
| 8 | Aesthetic and Minimalist Design | 3 | Prose styles excellent; editor chrome crammed into reader meta line |
| 9 | Error Recovery | 2 | One generic comment error regardless of cause |
| 10 | Help and Documentation | 2 | Guest-comment hint good; Fork explains nothing |
| **Total** | | **25/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment**: designed, not generated. The prose grammar (em-dash bullets, "· · ·" rules, mono table headers, token-driven callouts) is specific and consistent — no gradient text, glass, hero-metrics, or card grids. Two caveats: the identity sits in the now-saturated editorial-typographic lane, so distinctiveness lives in execution; and the end-matter (References / Related events / Forks) reverts to generic Tailwind headings — the last screenful is the least convincing.

**Deterministic scan**: 133 findings, but only 1 warning — the callout left-rule, a **false positive** (sanctioned quote grammar per DESIGN.md). The one clearly actionable hit: hardcoded `rgb(59 130 246 / 0.6)` tour-highlight ring at `globals.css:1227` (should be `var(--accent)`). 108 font-size advisories reduce to one systemic note: the documented type ramp under-documents actual practice. Radius/shadow advisories are drift-in-spirit at worst.

**Visual overlays**: skipped — no browser automation and dev server intentionally not started (production DB).

## Overall Impression

The reading column delivers the "Quiet Library" promise — then the page forgets itself. Above the fold and in prose, this is a designed editorial object; after the prose, the scholarly apparatus (references, forks, events) speaks generic Tailwind while only Discussion follows the system. The single biggest opportunity: the apparatus of a rigor-first platform should be its signature moment, and right now it's its most generic.

## What's Working

- `.markdown-content` prose system: em-dash bullets, three-dot hr, 9px mono table headers, semantic callouts — a coherent editorial grammar with taste.
- Accessibility infrastructure is real: global `:focus-visible` ring, reduced-motion safety net, 16px mobile inputs, honeypot correctly hidden.
- Comment moderation UX: pending visibility rules, tombstone pruning, DB-clock edit window.

## Priority Issues

- **[P0] Every article is titled "Principia Synthesia"** — no `generateMetadata`; articles have no identity in tabs, SERPs, or link unfurls. Fix: per-article `generateMetadata` (title, summary description, OG/Twitter). *Suggested: $impeccable harden*
- **[P1] Stale-warning banner renders inside the meta-line flex row** — `LastVerifiedBadge` emits a block banner into `flex items-center`, jamming a paragraph-length alert between dot separators. Fix: split component; banner becomes a sibling block. *Suggested: $impeccable layout*
- **[P1] Fork button uses nonexistent `themed-btn-secondary`** — renders as unstyled text; invisible affordance. Fix: `themed-btn-outline`. *Suggested: $impeccable polish*
- **[P1] End-matter speaks three design languages** — References/Related events/Forks use ad-hoc `text-lg` headings with drifting margins; Discussion alone uses the eyebrow + rule + mono count. Fix: one section grammar (Discussion's) for all four. *Suggested: $impeccable layout*
- **[P2] Broken document outline** — MDX h1s render as literal h1s after the page h1; "Discussion" is a `<p>`, invisible to heading navigation. Fix: demote MDX headings via `components` map; make Discussion an h2. *Suggested: $impeccable audit*

## Persona Red Flags

**Jordan (first-time reader)**: breadcrumb doesn't look like a link (uppercase accent, no underline); "Fork (sign in)" unexplained; stale articles greet her with a mis-laid-out warning wall.

**Sam (screen reader/keyboard)**: "·" separators are announced (need `aria-hidden`); heading-jump navigation corrupted by multiple h1s and skips Discussion; duplicate adjacent fork-lineage links; Delete fires on a single Enter with no confirm; `[?]` citation meaning only in a `title` attribute.

**Casey (mobile one-handed)**: Reply/Edit/Delete are ~12×16px targets vs the app's own 44px standard, and the action row idles at 70% opacity with a hover reveal that never fires on touch; meta row wraps into a 3–4 line pile at 320px; 9px mono table headers near-illegible.

## Minor Observations

- Bibliography double-numbers unresolved entries ("3. [3] Unknown article: slug") and leaks raw slugs.
- Dangling "·" when `createdAt` is null; "…and N more forks" links nowhere.
- Hardcoded ambers in Cite.tsx / ArticleMetadata.tsx despite `--color-warning` existing.
- Inline style objects re-state token values (h1 clamp, monoMeta) — drift risk.
- Sequential per-fork/per-citation queries before first byte, no `loading.tsx`/Suspense.
- Reply affordance silently vanishes at depth 5.
- Fork-lineage "[link to original →]" bracket styling is the one web-1.0 note on the page.
- Tour-highlight ring hardcodes Tailwind blue (`globals.css:1227`).

## Questions to Consider

1. Shouldn't the bibliography of a rigor-first platform be its signature moment rather than its most generic section?
2. Does editor chrome belong on the brand-register reading surface at all — what would a separate editor rail cost?
3. Is "built for the long session" a typographic claim or a navigational one? (No TOC, no progress, no way back.)
