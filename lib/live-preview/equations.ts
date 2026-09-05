import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { equationTransforms } from "@/lib/equation-refs";

/**
 * Document-wide equation numbering for the live editor.
 *
 * The editor renders each formula on its own, so nothing in a single formula
 * knows it is equation (5) or that `\eqref{flux}` points three blocks down.
 * This field scans the whole document once per edit and stores the rewritten
 * TeX for every formula, keyed by the offset the formula starts at — the same
 * position the editor's own syntax tree reports, so the two line up exactly.
 *
 * Recomputed only on a document change: numbering cannot move otherwise.
 */
export interface EquationState {
  /** Formula start offset → TeX with numbers tagged and references resolved. */
  byOffset: Map<number, string>;
  /** Label → equation number. */
  numbers: Map<string, number>;
}

const EMPTY: EquationState = { byOffset: new Map(), numbers: new Map() };

function scan(state: EditorState): EquationState {
  try {
    return equationTransforms(state.doc.toString());
  } catch {
    // Numbering must never take the editor down; un-numbered math still
    // renders, exactly as it did before this existed.
    return EMPTY;
  }
}

export const equationField = StateField.define<EquationState>({
  create: scan,
  update(value, tr) {
    if (!tr.docChanged) return value;
    return scan(tr.state);
  },
});

/**
 * The rewritten TeX for the formula starting at `offset`, or the original when
 * the document has nothing to add to it.
 */
export function equationTex(state: EditorState, offset: number, fallback: string): string {
  return state.field(equationField, false)?.byOffset.get(offset) ?? fallback;
}

export const equations: Extension = [equationField];
