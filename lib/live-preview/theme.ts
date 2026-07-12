import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Editor chrome theme for both Source and Live Preview modes, built on the
 * app's CSS custom properties so user themes and dark mode apply with zero JS.
 *
 * NOTE: all live-preview *typography* (.cm-lp-* classes) lives in
 * app/globals.css, co-located with the .markdown-content rules it must match
 * — globals.css owns component styling in this project (see the dialog CSS
 * convention). This file only styles the editor shell and source-mode
 * syntax highlighting.
 */

const chrome = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "1.0625rem",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    lineHeight: "1.8",
  },
  // Fixed readable measure in every mode so toggling Live/Source/Preview
  // never shifts the text column (min() keeps narrow panels overflow-free).
  ".cm-content": {
    maxWidth: "min(52rem, 100%)",
    margin: "0 auto",
    padding: "1.25rem 0",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0 1.25rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { background: "color-mix(in srgb, var(--accent) 22%, transparent)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
  },
  // No gutters in either mode: the editor reads like a page, and the text
  // column stays byte-identical when toggling Live/Source. (Grammar
  // diagnostics still underline inline; only the gutter dots are gone.)
  ".cm-gutters": { display: "none" },
});

/**
 * Restrained editorial syntax highlighting for source mode and for constructs
 * live preview leaves untouched (fenced code, JSX, tables, revealed syntax).
 */
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600" },
  { tag: t.processingInstruction, color: "var(--muted-foreground)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--muted-foreground)" },
  { tag: t.monospace, fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.875em" },
  { tag: t.meta, color: "var(--muted-foreground)" },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: t.keyword, color: "var(--accent)" },
  { tag: t.string, color: "var(--muted-foreground)" },
  { tag: t.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "var(--muted-foreground)" },
  // STEX math tokens (lib/codemirror-math.ts nests the stex stream parser):
  // \commands are "tag", { } [ ] are "bracket", plus atom/number/error.
  { tag: t.tagName, color: "var(--accent)" },
  { tag: t.bracket, color: "var(--muted-foreground)" },
  { tag: t.atom, color: "var(--accent)" },
  { tag: t.number, color: "var(--foreground)", fontWeight: "500" },
  { tag: t.invalid, color: "var(--color-warning-border, #b45309)" },
]);

export const editorTheme: Extension = [chrome, syntaxHighlighting(highlight)];
