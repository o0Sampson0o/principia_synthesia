import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { livePreviewView } from "./view-plugin";
import { blockMath } from "./block-math";
import { callout } from "./callout";
import { blockTable } from "./block-table";
import { mathTooltip } from "./math-tooltip";
import { measureSync } from "./measure-sync";

/**
 * Obsidian-style live preview: markdown renders in place, syntax reveals
 * where the selection is, rich content becomes widgets. The document is
 * always pure text — every decoration is view-only.
 */
export function livePreview(): Extension {
  return [
    EditorView.editorAttributes.of({ class: "cm-lp-live" }),
    livePreviewView,
    blockMath,
    callout,
    blockTable,
    mathTooltip,
    measureSync,
  ];
}
