import { WidgetType } from "@codemirror/view";
import katex from "katex";
import { EMPTY_MACROS, type LiveMacros } from "../macros";

/**
 * KaTeX widgets for live preview. `renderToString` is pure string templating
 * (no eval — CSP-safe per docs/content.md) and its stylesheet is already
 * global (globals.css imports katex.min.css).
 *
 * Rendered HTML is cached per formula so each distinct formula is rendered
 * exactly once, and widgets implement eq() so CodeMirror reuses their DOM
 * across decoration rebuilds — typing elsewhere never re-renders math.
 *
 * Author macros arrive via the katexMacrosFacet. Both the cache key and eq()
 * include the macro version, so editing a definition re-renders the formulas
 * that use it instead of serving the previous HTML.
 */

const CACHE_MAX = 500;
const cache = new Map<string, string>();

export function renderKatex(
  formula: string,
  displayMode: boolean,
  live: LiveMacros = EMPTY_MACROS
): string {
  const key = `${displayMode ? "D" : "I"}${live.version} ${formula}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let html: string;
  try {
    html = katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      output: "htmlAndMathml",
      // A copy per formula: KaTeX writes back the definitions it reads, so a
      // shared object would let a stray \def in prose math leak into every
      // later formula. buildKatexMacros has already applied the author's
      // definitions block with globalGroup, so the copy starts complete.
      macros: { ...live.macros },
      // Equation numbering injects \htmlId on tags and \href on references,
      // both trust-gated in KaTeX. Allowed for our own #eq- anchors only, so
      // an author cannot smuggle a URL through a formula.
      trust: (ctx: { command: string; url?: string; id?: string }) =>
        (ctx.command === "\\href" && (ctx.url ?? "").startsWith("#eq-")) ||
        (ctx.command === "\\htmlId" && (ctx.id ?? "").startsWith("eq-")),
      // Otherwise KaTeX warns once per numbered equation, on every keystroke.
      strict: (code: string) => (code === "htmlExtension" ? "ignore" : "warn"),
    });
  } catch (err) {
    const div = document.createElement("span");
    div.className = "cm-lp-math-error";
    div.textContent = `KaTeX: ${err instanceof Error ? err.message : String(err)}`;
    html = div.outerHTML;
  }

  if (cache.size >= CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, html);
  return html;
}

/** For tests: expose cache size without leaking the map. */
export function __katexCacheSize(): number {
  return cache.size;
}

export class InlineMathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly live: LiveMacros = EMPTY_MACROS
  ) {
    super();
  }
  eq(other: InlineMathWidget): boolean {
    return other.formula === this.formula && other.live.version === this.live.version;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-math";
    span.innerHTML = renderKatex(this.formula, false, this.live);
    return span;
  }
  ignoreEvent(): boolean {
    return false; // clicks place the cursor → source reveals
  }
}

export class BlockMathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly live: LiveMacros = EMPTY_MACROS
  ) {
    super();
  }
  eq(other: BlockMathWidget): boolean {
    return other.formula === this.formula && other.live.version === this.live.version;
  }
  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-lp-math-block";
    div.innerHTML = renderKatex(this.formula, true, this.live);
    return div;
  }
  ignoreEvent(): boolean {
    return false;
  }
}
