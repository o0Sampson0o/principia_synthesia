import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { selectionIntersects, frontmatterExtent } from "./reveal";
import { CalloutWidget, canonicalType } from "./widgets/callout";
import { katexMacrosFacet } from "./macros";

/**
 * WYSIWYG callout ($> [!type]$) rendering. Like block math and tables, a
 * multi-line block replacement must come from a StateField (not a ViewPlugin).
 * When the selection is inside the callout it collapses to raw source — the
 * per-line callout styling in decorate.ts then shows the editable markdown;
 * otherwise it renders as a `.callout` box matching the published page.
 *
 * Inner block math is deliberately handled here (not by block-math.ts): those
 * `$$…$$` lines carry `>` quote marks and must render inside the box, so
 * block-math.ts skips any BlockMath with a Blockquote ancestor to avoid two
 * overlapping block-replace decorations (which CM6 forbids).
 *
 * Incrementality mirrors block-math.ts: the tree is only re-walked on doc/tree
 * change; pure selection moves reuse the cached list and recompute reveal.
 */

interface Callout {
  from: number; // line start of the blockquote
  to: number; // line end of the blockquote
  type: string; // canonical callout type
  raw: string; // full source of the line range
}

interface CalloutState {
  callouts: Callout[];
  deco: DecorationSet;
}

/** A blockquote line opening with `> [!type]` — marks it as a callout. */
const CALLOUT_LINE_RE = /^\s*>\s*\[!(\w+)\]/;

export function findCallouts(state: EditorState): Callout[] {
  const callouts: Callout[] = [];
  const fmEnd = frontmatterExtent(state.doc);
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Blockquote") return;
      if (node.from < fmEnd) return false;
      const m = CALLOUT_LINE_RE.exec(state.doc.lineAt(node.from).text);
      if (!m) return; // plain quote → left to decorate.ts (and any nested callout)
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      callouts.push({
        from,
        to,
        type: canonicalType(m[1]),
        raw: state.doc.sliceString(from, to),
      });
      return false; // whole blockquote becomes one widget; don't descend
    },
  });
  return callouts;
}

function buildDeco(state: EditorState, callouts: Callout[]): DecorationSet {
  const decos = callouts
    .filter((c) => !selectionIntersects(state.selection, c.from, c.to))
    .map((c) =>
      Decoration.replace({
        widget: new CalloutWidget(c.type, c.raw, state.facet(katexMacrosFacet)),
        block: true,
      }).range(c.from, c.to)
    );
  return Decoration.set(decos, true);
}

export const calloutField = StateField.define<CalloutState>({
  create(state) {
    const callouts = findCallouts(state);
    return { callouts, deco: buildDeco(state, callouts) };
  },
  update(value, tr) {
    // Same tree-identity guard as block-math: Lezer may extend the tree after
    // the doc-changing transaction, so re-walk when the tree instance changes.
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    // Callout bodies contain rendered KaTeX, so a macros reconfigure has to
    // rebuild them even though it touches no text, selection or tree.
    const macrosChanged =
      tr.state.facet(katexMacrosFacet) !== tr.startState.facet(katexMacrosFacet);
    if (!tr.docChanged && !tr.selection && !treeChanged && !macrosChanged) return value;
    const callouts =
      tr.docChanged || treeChanged ? findCallouts(tr.state) : value.callouts;
    return { callouts, deco: buildDeco(tr.state, callouts) };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (v) => v.deco),
    EditorView.atomicRanges.of((view) => view.state.field(field).deco),
  ],
});

export const callout: Extension = calloutField;
