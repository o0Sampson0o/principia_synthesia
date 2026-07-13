import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { selectionIntersects, frontmatterExtent } from "./reveal";
import { TableWidget } from "./widgets/table";

/**
 * GFM table rendering. Tables span multiple lines, so (like block math) their
 * block replacement must come from a StateField. When the selection is inside
 * a table it collapses to raw source for editing; otherwise it renders as an
 * HTML table matching the published page.
 */

interface TableRange {
  from: number;
  to: number;
  source: string;
}

function findTables(state: EditorState): TableRange[] {
  const tables: TableRange[] = [];
  const fmEnd = frontmatterExtent(state.doc);
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;
      if (node.from < fmEnd) return false;
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      tables.push({ from, to, source: state.doc.sliceString(from, to) });
      return false;
    },
  });
  return tables;
}

function buildDeco(state: EditorState, tables: TableRange[]): DecorationSet {
  const decos = tables
    .filter((t) => !selectionIntersects(state.selection, t.from, t.to))
    .map((t) =>
      Decoration.replace({ widget: new TableWidget(t.source), block: true }).range(t.from, t.to)
    );
  return Decoration.set(decos, true);
}

interface TableState {
  tables: TableRange[];
  deco: DecorationSet;
}

export const blockTableField = StateField.define<TableState>({
  create(state) {
    const tables = findTables(state);
    return { tables, deco: buildDeco(state, tables) };
  },
  update(value, tr) {
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    if (!tr.docChanged && !tr.selection && !treeChanged) return value;
    const tables = tr.docChanged || treeChanged ? findTables(tr.state) : value.tables;
    return { tables, deco: buildDeco(tr.state, tables) };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (v) => v.deco),
    EditorView.atomicRanges.of((view) => view.state.field(field).deco),
  ],
});

export const blockTable: Extension = blockTableField;
