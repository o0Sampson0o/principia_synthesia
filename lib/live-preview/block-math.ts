import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { selectionIntersects, frontmatterExtent } from "./reveal";
import { BlockMathWidget } from "./widgets/math";
import { katexMacrosFacet } from "./macros";

/**
 * Block math ($$…$$) rendering. CM6 requires multi-line replacing/block
 * decorations to come from a StateField, not a ViewPlugin — this is v1's only
 * block decoration on purpose (block widgets are where layout bugs live).
 *
 * Incrementality: the syntax tree is only re-walked when the document
 * changes (Lezer itself re-parses incrementally); pure selection moves reuse
 * the cached block list and merely recompute which blocks are revealed.
 * Widget eq() means unchanged formulas keep their rendered DOM.
 */

interface MathBlock {
  from: number; // line start of the block
  to: number; // line end of the block
  formula: string;
}

interface BlockMathState {
  blocks: MathBlock[];
  deco: DecorationSet;
}

function findBlocks(state: EditorState): MathBlock[] {
  const blocks: MathBlock[] = [];
  const fmEnd = frontmatterExtent(state.doc);
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "BlockMath") return;
      if (node.from < fmEnd) return false;
      // Block math inside a callout/blockquote is rendered by calloutField
      // (its lines carry `>` quote marks). Skipping it here prevents two
      // overlapping block-replace decorations, which CM6 forbids.
      for (let p = node.node.parent; p; p = p.parent) {
        if (p.name === "Blockquote") return false;
      }
      const text = state.doc.sliceString(node.from, node.to);
      const closed = text.length > 4 && text.endsWith("$$");
      if (!closed) return false; // unterminated → leave as source
      const formula = text.slice(2, -2).trim();
      if (!formula) return false;
      blocks.push({
        from: state.doc.lineAt(node.from).from,
        to: state.doc.lineAt(node.to).to,
        formula,
      });
      return false;
    },
  });
  return blocks;
}

function buildDeco(state: EditorState, blocks: MathBlock[]): DecorationSet {
  const decos = blocks
    .filter((b) => !selectionIntersects(state.selection, b.from, b.to))
    .map((b) =>
      Decoration.replace({
        widget: new BlockMathWidget(b.formula, state.facet(katexMacrosFacet)),
        block: true,
      }).range(b.from, b.to)
    );
  return Decoration.set(decos, true);
}

export const blockMathField = StateField.define<BlockMathState>({
  create(state) {
    const blocks = findBlocks(state);
    return { blocks, deco: buildDeco(state, blocks) };
  },
  update(value, tr) {
    // Lezer parses asynchronously: the tree can grow *after* the transaction
    // that changed the doc (the language plugin dispatches as it advances).
    // Without the tree-identity check, math blocks beyond the initially
    // parsed region would never render.
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    // A macros reconfigure changes no text, no selection and no tree, so the
    // early return below would keep block math rendered without the author's
    // definitions until the next edit.
    const macrosChanged =
      tr.state.facet(katexMacrosFacet) !== tr.startState.facet(katexMacrosFacet);
    if (!tr.docChanged && !tr.selection && !treeChanged && !macrosChanged) return value;
    const blocks =
      tr.docChanged || treeChanged ? findBlocks(tr.state) : value.blocks;
    return { blocks, deco: buildDeco(tr.state, blocks) };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (v) => v.deco),
    EditorView.atomicRanges.of((view) => view.state.field(field).deco),
  ],
});

export const blockMath: Extension = blockMathField;
