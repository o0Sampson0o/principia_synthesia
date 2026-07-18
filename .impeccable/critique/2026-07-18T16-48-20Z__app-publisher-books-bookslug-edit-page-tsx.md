---
target: book curriculum editor
total_score: 21
p0_count: 2
p1_count: 2
timestamp: 2026-07-18T16-48-20Z
slug: app-publisher-books-bookslug-edit-page-tsx
---
Method: dual-agent (A: aaa98f17e4b1780d6 · B: a2ba9c7b9b41195e0)

# Critique — book curriculum editor (app/[publisher]/books/[bookSlug]/edit). First run. Total 21/40.

Heuristics: status 2, real-world 3, control 2, consistency 1, error-prevention 2, recognition 2, flexibility 3, aesthetic 2, recovery 1, help 3.

Verdict: not slop-by-decoration but drift-by-reinvention — solid logic (dnd-kit keyboard drag, local-overlay reorder, absorb model) wrapped in chrome that predates the design system. Rows are bordered card-boxes in space-y-2 (contradicts the List Row / Hairline signature); hardcoded text-red-500/700, text-blue-500, border-red-200, bg-red-50 (Token Rule); blue "Unlink" is a second accent (One Voice Rule); plain `border` never resolves to var(--border) so it won't invert in dark mode.

Strengths: reorder model + keyboard drag genuinely well-built; teaching microcopy above average.

P0: (1) hardcoded/unthemed status colors + foreign blue accent → route through danger token, Unlink neutral. (2) Remove/Unlink are silent, unconfirmed, void-returning (errors swallowed) → ToastForm + inline confirm/undo.
P1: (3) rows reinvent the banned card pattern → flush hairline rows (ps-content-row). (4) Part vs Chapter visually identical (§ box, only ml-4 apart) → mono PART/CHAPTER micro-labels + stronger nesting.
P2: (5) no responsive/touch — non-wrapping packed rows, px-1 handle under 44px, hover-only tooltips.

Also: 6 equal-weight accent buttons (no primary); 5 always-open add-forms wall; global section numbering fights the tiers; per-section redundant partTitle label; rounded vs rounded-lg inconsistency; badge vs tag pill mismatch.

Open questions: removing a divider with nested sections — no guard for orphaned children; should numbering reset per chapter; should the 5-form cluster become an "Add ▾" menu.

Detector: 0 warnings, 2 advisory font-size (inline button sizes). NOTE: detector's color rule does NOT flag Tailwind utility colors (text-red-500 etc.), so it missed the Token Rule breaches the design read caught — the hardcoded colors are real.
