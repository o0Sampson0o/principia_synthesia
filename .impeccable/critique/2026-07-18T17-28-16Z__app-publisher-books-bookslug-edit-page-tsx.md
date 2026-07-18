---
target: book curriculum editor
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-07-18T17-28-16Z
slug: app-publisher-books-bookslug-edit-page-tsx
---
Method: dual-agent (A: a211e274570e448ef · B: a2349740260749eaa)

# Critique #2 — book curriculum editor, after the polish pass. Total 26/40 (was 21).

Heuristics: status 3, real-world 3, control 2, consistency 2, error-prevention 2, recognition 3, flexibility 2, aesthetic 3, recovery 3, help 3.

Verdict flipped from "distrust the chrome" to "a Linear/Notion-fluent user would trust it." All prior P0/P1 defects cleared: detector grep confirms ZERO hardcoded colors; token routing, flush hairline rows (List Row signature), in-page themed confirm dialogs with excellent consequence copy, non-navigating toasts, and progressive-disclosure Add toolbar all explicitly credited as strengths.

New (deeper) findings, fresh critique:
- [P0] Unsaved drag order is silently destroyed by any row action: the list is keyed on saved entry-id order, so a rename/remove/absorb revalidates → remounts → resets orderIds to null, dropping an in-progress reorder with no prompt. Real interaction trap. Fix: when dirty, disable/guard row actions or fold order into the same optimistic layer.
- [P1] Hierarchy reads two-level not three: Chapter dividers and Sections BOTH use pl-6 — same indent (genuine oversight introduced in the redesign). Fix: stagger Part flush / Chapter pl-4 / Section pl-8, and/or tint dividers.
- [P1] New entries always append to end (position=rows.length) → long drags in big books. Deliberate trade-off but flagged.
- [P2] Divider titles are always-on input+Rename fields (form-wall feel, extra uncommitted state); prefer edit-on-click text.
- [P2] Status chips break Mono Fact/consistency: internal=themed-badge (square), external=themed-tag (pill) — two shapes for peer statuses, neither on ps-status-pill+ps-mono-micro.

Also: no single "save everything" gesture (book fields / renames / order are 3 uncommitted states); handle ~28x32px under 44px touch floor; identical aria-label on every handle; section-number column width:1.75rem clips 3-digit numbers; ps-quiet-action at muted-foreground near AA floor.

Detector: 0 warnings, 1 advisory font-size (inline 0.8125rem on Access button). Grep: no hardcoded Tailwind colors.
