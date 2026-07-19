import { linter, forEachDiagnostic, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import type { EditorState, Extension } from "@codemirror/state";

interface GrammarMessageDTO {
  from: number;
  to: number;
  reason: string;
  ruleId: string | null;
  source: string | null;
  expected: string[];
}

/** Diagnostic carrying the checker's raw suggestions for the context menu. */
interface GrammarDiagnostic extends Diagnostic {
  expected: string[];
}

/** Max spelling suggestions to offer per issue. */
const MAX_SUGGESTIONS = 6;

/**
 * CodeMirror extension that runs the article's prose through the server-side
 * grammar/spell checker (`/api/grammar`) and renders the results as wavy
 * underlines. Suggestions live in a compact right-click context menu on the
 * underlined range (Obsidian-style) instead of the default lint hover
 * tooltip. Checks are debounced and the full document is sent each time;
 * network/empty cases fail silent (no diagnostics).
 */
export function grammarChecker(): Extension {
  return [
    contextMenuHandler,
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
        const diagnostics: GrammarDiagnostic[] = [];
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
            expected: m.expected.slice(0, MAX_SUGGESTIONS),
          });
        }
        return diagnostics;
      },
      // The context menu replaces the hover tooltip entirely.
      { delay: 800, tooltipFilter: () => [] }
    ),
  ];
}

interface SuggestionHit {
  from: number;
  to: number;
  expected: string[];
}

/** First grammar diagnostic whose (remapped) range covers `pos`, if any. */
export function diagnosticAt(state: EditorState, pos: number): SuggestionHit | null {
  const hits: SuggestionHit[] = [];
  forEachDiagnostic(state, (d, from, to) => {
    // Only grammar diagnostics carry `expected`; other linters (e.g. the
    // HTML-tag linter) coexist in the same lint state but must not open the
    // grammar suggestion menu.
    const expected = (d as GrammarDiagnostic).expected;
    if (hits.length === 0 && Array.isArray(expected) && from <= pos && pos <= to) {
      hits.push({ from, to, expected });
    }
  });
  return hits[0] ?? null;
}

const contextMenuHandler = EditorView.domEventHandlers({
  contextmenu(event, view) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;

    const hit = diagnosticAt(view.state, pos);
    // Not on an underlined range → keep the browser's native menu.
    if (!hit) return false;

    event.preventDefault();
    openSuggestionMenu(view, hit, event.clientX, event.clientY);
    return true;
  },
});

/** The one open menu; opening another (or any dismiss event) closes it. */
let closeOpenMenu: (() => void) | null = null;

export function openSuggestionMenu(view: EditorView, hit: SuggestionHit, x: number, y: number) {
  closeOpenMenu?.();

  const menu = document.createElement("div");
  menu.className = "cm-grammar-menu";
  menu.setAttribute("role", "menu");

  const items: HTMLButtonElement[] = [];
  let active = -1;

  const setActive = (i: number) => {
    items[active]?.classList.remove("is-active");
    active = i;
    items[active]?.classList.add("is-active");
  };

  if (hit.expected.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cm-grammar-menu-empty";
    empty.textContent = "No suggestions";
    menu.appendChild(empty);
  } else {
    for (const word of hit.expected) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "cm-grammar-menu-item";
      item.setAttribute("role", "menuitem");
      item.textContent = word;
      item.addEventListener("click", () => {
        close();
        view.dispatch({
          changes: { from: hit.from, to: hit.to, insert: word },
        });
        view.focus();
      });
      item.addEventListener("mousemove", () => setActive(items.indexOf(item)));
      menu.appendChild(item);
      items.push(item);
    }
  }

  document.body.appendChild(menu);

  // Clamp to the viewport (fixed positioning).
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      view.focus();
    } else if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((active + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((active - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      items[active].click();
    } else if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
      // Typing continues in the editor — close like a native context menu
      // so the captured range can't go stale under the open menu.
      close();
    }
  }
  function onMouseDown(e: MouseEvent) {
    if (!menu.contains(e.target as Node)) close();
  }
  const close = () => {
    closeOpenMenu = null;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("mousedown", onMouseDown, true);
    window.removeEventListener("scroll", close, true);
    window.removeEventListener("resize", close);
    window.removeEventListener("blur", close);
    menu.remove();
  };
  closeOpenMenu = close;

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);
  window.addEventListener("blur", close);
}
