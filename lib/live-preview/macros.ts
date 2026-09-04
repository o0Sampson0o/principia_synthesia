import { Facet } from "@codemirror/state";
import type { KatexMacros } from "@/lib/katex-macros";

/**
 * Author-defined KaTeX macros, made available to the live-preview math widgets.
 *
 * The LIVE tab renders math in the editor with `katex.renderToString`, which
 * knows nothing unless it is handed a `macros` object — so before this facet
 * existed, a `\odv` defined in the article's ```katex block (or inherited from
 * the parent book) rendered red in LIVE while rendering correctly in PREVIEW
 * and on the published page, which both go through `buildKatexMacros`.
 *
 * `version` exists because the widgets cache rendered HTML and CodeMirror
 * reuses widget DOM whenever `eq()` says two widgets match. Both are keyed on
 * it, so editing a macro definition invalidates exactly the formulas that
 * depend on it rather than silently showing the previous rendering.
 */
export interface LiveMacros {
  /** Bumped whenever the macro *source* changes; keys the render cache. */
  version: number;
  macros: KatexMacros;
}

export const EMPTY_MACROS: LiveMacros = { version: 0, macros: {} };

export const katexMacrosFacet = Facet.define<LiveMacros, LiveMacros>({
  combine: (values) => values[0] ?? EMPTY_MACROS,
});
