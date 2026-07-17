---
target: article reading page
total_score: 29
p0_count: 0
p1_count: 2
timestamp: 2026-07-17T18-14-27Z
slug: app-publisher-articles-slug-page-tsx
---
Method: dual-agent (A: a5aef19c52864fd0e · B: a0e31dc6b17e47991)

# Critique #6 — after P1-P3 backlog (anchors/TOC, focus mgmt, Continue reading, read-only snapshots). Total 29/40.

Heuristics: status 3, real-world 2, control 3, consistency 3, error-prevention 3, recognition 3, flexibility 3, aesthetic 4, recovery 3, help 2.

Landed and praised: heading demotion outline, TOC (+/− mono toggle "lovely"), § anchors, focus management in comment forms, MdxErrorBoundary "a model", snapshot read-only mode "consistently" handled, summary/description dedupe, Continue reading pathway noted (though whisper-quiet), edge cases "designed, not patched".
New P1s (register/robustness, no defects): native window.confirm on Fork/delete breaks the Quiet Library register (system owns a styled dialog vocabulary); forkArticle has no error path (server failure ejects to route error page).
P2: Fork unexplained on-surface (tooltip-only); end-matter SectionHeader h2s at 11px invert hierarchy (comment bylines outrank their section heading).
P3: 9px status pills on phones; staleness model inverted (never-verified articles show nothing).
Questions raised: is 1.0625rem prose a deliberate amendment (document it)?; is "Fork" the right vocabulary for scholars?; is eyebrow-scale end-matter wayfinding intentional?
Detector: 0 warnings, 59 advisory font-size (28 in timeline components; only 1 on the page itself).
