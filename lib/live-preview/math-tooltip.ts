import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { showTooltip, type Tooltip } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { renderKatex } from "./widgets/math";
import { katexMacrosFacet } from "./macros";
import { equationTex } from "./equations";

/**
 * Obsidian-style math editing aid (the Latex Suite behavior): while the
 * selection is inside a math region — where live preview shows the raw LaTeX
 * source — a floating tooltip above the region shows the rendered equation,
 * re-rendered on every keystroke. Leave the region and the tooltip vanishes
 * (the source collapses back into its widget).
 */

interface MathAtCursor {
  from: number;
  formula: string;
  displayMode: boolean;
}

export function mathAtCursor(state: EditorState): MathAtCursor | null {
  const head = state.selection.main.head;
  // resolveInner with both side biases so the boundary positions ($|x$ and
  // $x$|) count as inside, matching the reveal semantics in decorate.ts.
  for (const side of [-1, 1] as const) {
    let node = syntaxTree(state).resolveInner(head, side);
    while (node.parent) {
      if (node.name === "InlineMath" || node.name === "BlockMath") {
        const text = state.doc.sliceString(node.from, node.to);
        const displayMode = node.name === "BlockMath";
        const formula = displayMode
          ? text.replace(/^\$\$/, "").replace(/\$\$\s*$/, "").trim()
          : text.replace(/^\$/, "").replace(/\$$/, "");
        if (!formula.trim()) return null;
        return { from: node.from, formula, displayMode };
      }
      node = node.parent;
    }
  }
  return null;
}

type KeyedTooltip = Tooltip & { key: string };

function buildTooltip(state: EditorState, prev: KeyedTooltip | null): KeyedTooltip | null {
  const math = mathAtCursor(state);
  if (!math) return null;
  const live = state.facet(katexMacrosFacet);
  // Same numbering the widgets get: this tooltip is a third render surface,
  // so without it \label shows raw and red here while rendering correctly a
  // few pixels away. Offset past the delimiters is what equation-refs keyed on.
  const tex = equationTex(
    state,
    math.from + (math.displayMode ? 2 : 1),
    math.formula
  );
  // Key off the resolved TeX, not the raw source: an edit elsewhere can
  // renumber this equation without changing a character inside it, and a
  // stale key would keep showing the previous number.
  const key = `${math.from}:${math.displayMode ? "D" : "I"}:${live.version}:${tex}`;
  // Same region + formula → keep the same tooltip object so CM reuses its DOM
  // (cursor motion within the formula doesn't flicker the preview).
  if (prev && prev.key === key) return prev;
  return {
    key,
    pos: math.from,
    above: true,
    arrow: false,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-lp-math-tooltip";
      dom.innerHTML = renderKatex(tex, math.displayMode, live);
      return { dom };
    },
  };
}

const mathTooltipField = StateField.define<KeyedTooltip | null>({
  create: (state) => buildTooltip(state, null),
  update(value, tr) {
    // A macros reconfigure changes neither doc nor selection, so without this
    // the hover preview keeps rendering without the author's definitions.
    const macrosChanged =
      tr.state.facet(katexMacrosFacet) !== tr.startState.facet(katexMacrosFacet);
    if (!tr.docChanged && !tr.selection && !macrosChanged) return value;
    return buildTooltip(tr.state, value);
  },
  provide: (field) => showTooltip.from(field),
});

export const mathTooltip: Extension = mathTooltipField;
