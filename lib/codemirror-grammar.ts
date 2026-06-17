import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";

interface GrammarMessageDTO {
  from: number;
  to: number;
  reason: string;
  ruleId: string | null;
  source: string | null;
  expected: string[];
}

/** Max spelling suggestions to offer as one-click fixes per issue. */
const MAX_SUGGESTIONS = 6;

/**
 * CodeMirror extension that runs the article's prose through the server-side
 * grammar/spell checker (`/api/grammar`) and renders the results as lint
 * diagnostics — wavy underlines, a gutter marker, and (for spelling) one-click
 * replacement actions. Checks are debounced and the full document is sent each
 * time; network/empty cases fail silent (no diagnostics).
 */
export function grammarChecker(): Extension {
  return [
    lintGutter(),
    linter(
      async (view): Promise<Diagnostic[]> => {
        const text = view.state.doc.toString();
        if (!text.trim()) return [];

        let payload: { messages?: GrammarMessageDTO[] };
        try {
          const res = await fetch("/api/grammar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: text }),
          });
          if (!res.ok) return [];
          payload = await res.json();
        } catch {
          return [];
        }

        const docLength = view.state.doc.length;
        const diagnostics: Diagnostic[] = [];
        for (const m of payload.messages ?? []) {
          if (typeof m.from !== "number" || typeof m.to !== "number") continue;
          const from = Math.max(0, Math.min(m.from, docLength));
          // Ensure a non-empty range so the underline is visible.
          const to = Math.max(from + 1, Math.min(m.to, docLength));
          if (from >= docLength) continue;

          diagnostics.push({
            from,
            to: Math.min(to, docLength),
            severity: "warning",
            source: m.source ?? undefined,
            message: m.reason,
            actions: m.expected.slice(0, MAX_SUGGESTIONS).map((word) => ({
              name: `Replace with “${word}”`,
              apply(v, a, b) {
                v.dispatch({ changes: { from: a, to: b, insert: word } });
              },
            })),
          });
        }
        return diagnostics;
      },
      { delay: 800 }
    ),
  ];
}
