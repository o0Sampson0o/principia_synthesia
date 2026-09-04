import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { EditorSelection, Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildInlineDecorations } from "./decorate";
import { selectionIntersects } from "./reveal";
import { katexMacrosFacet } from "./macros";

/**
 * The live-preview engine: viewport-scoped decorations rebuilt only when they
 * can actually change. Cost per rebuild is O(visible nodes), never O(doc) —
 * Lezer re-parses incrementally on edits, and this plugin only walks
 * `view.visibleRanges`.
 *
 * Rebuild policy:
 *  - doc changed / viewport changed / parse progressed → rebuild
 *  - author macros redefined → rebuild (math must re-render with them)
 *  - selection-only updates → rebuild only if the old or new selection
 *    touches a selection-sensitive node range (cheap array probe)
 *  - during mouse-drag selection → defer rebuilds until mouseup, so
 *    decorations don't shift under an active drag
 */
class LivePreviewPlugin {
  decorations: DecorationSet = Decoration.none;
  atomics: DecorationSet = Decoration.none;
  private nodeRanges: { from: number; to: number }[] = [];
  private dragging = false;
  private pending = false;
  private readonly onMouseDown = () => {
    this.dragging = true;
  };
  private readonly onMouseUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.pending) {
      // Trigger an (empty) update cycle so the deferred rebuild runs.
      setTimeout(() => this.view.dispatch({}), 0);
    }
  };

  constructor(private view: EditorView) {
    this.build(view);
    view.contentDOM.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  destroy() {
    this.view.contentDOM.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  update(update: ViewUpdate) {
    const structural =
      update.docChanged ||
      update.viewportChanged ||
      syntaxTree(update.state) !== syntaxTree(update.startState) ||
      // A macros reconfigure changes no text, no selection and no tree, so
      // without this the math keeps the rendering it got before the author's
      // definitions were known — which is every formula on first load.
      update.state.facet(katexMacrosFacet) !== update.startState.facet(katexMacrosFacet);

    if (!structural && !update.selectionSet && !this.pending) return;

    if (!structural && update.selectionSet && !this.pending) {
      // Selection-only move: skip when it cannot change any reveal state.
      const touches = (sel: EditorSelection) =>
        this.nodeRanges.some((r) => selectionIntersects(sel, r.from, r.to));
      if (!touches(update.startState.selection) && !touches(update.state.selection)) {
        return;
      }
    }

    if (this.dragging && !structural) {
      this.pending = true;
      return;
    }

    this.pending = false;
    this.build(update.view);
  }

  private build(view: EditorView) {
    const built = buildInlineDecorations(view.state, view.visibleRanges);
    this.decorations = built.decorations;
    this.atomics = built.atomics;
    this.nodeRanges = built.nodeRanges;
  }
}

const plugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (v) => v.decorations,
});

export const livePreviewView: Extension = [
  plugin,
  EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomics ?? Decoration.none),
];
