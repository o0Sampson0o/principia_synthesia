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
  // Slash-menu (autocomplete) popup — a command palette. Each row: a bordered
  // glyph token carrying the block's markdown symbol, the block name, and the
  // exact syntax it inserts (monospace, right-aligned). The selected row takes
  // an accent spine + accent-dim fill.
  ".cm-tooltip.cm-tooltip-autocomplete": {
    borderRadius: "9px",
    boxShadow: "0 10px 34px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    maxHeight: "20rem",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "0.36rem 0.55rem",
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    borderLeft: "2px solid transparent",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "color-mix(in srgb, var(--accent) 13%, var(--surface))",
    borderLeftColor: "var(--accent)",
    color: "var(--foreground)",
  },
  // The glyph token (CodeMirror's completion "icon" slot, keyed by `type`).
  ".cm-completionIcon": {
    display: "grid",
    placeItems: "center",
    width: "1.5rem",
    height: "1.5rem",
    minWidth: "1.5rem",
    padding: "0",
    margin: "0",
    border: "1px solid var(--border)",
    borderRadius: "5px",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "0.72rem",
    color: "var(--muted-foreground)",
    opacity: "1",
  },
  // Each block's glyph, keyed by the completion's `type` (see slash-menu.ts).
  ".cm-completionIcon-h1::after, .cm-completionIcon-h2::after, .cm-completionIcon-h3::after":
    { content: '"#"' },
  ".cm-completionIcon-ul::after": { content: '"—"' },
  ".cm-completionIcon-ol::after": { content: '"1."' },
  ".cm-completionIcon-todo::after": { content: '"☑"' },
  ".cm-completionIcon-quote::after": { content: '"❝"' },
  ".cm-completionIcon-callout::after": { content: '"!"' },
  ".cm-completionIcon-toggle::after": { content: '"▸"' },
  ".cm-completionIcon-code::after": { content: '"`"' },
  ".cm-completionIcon-hr::after": { content: '"···"' },
  ".cm-completionIcon-table::after": { content: '"▦"' },
  ".cm-completionIcon-math::after": { content: '"∑"' },
  ".cm-completionIcon-wikilink::after": { content: '"[["' },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionIcon": {
    borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
    color: "var(--accent)",
  },
  ".cm-completionLabel": { flex: "1", fontSize: "0.875rem" },
  ".cm-completionDetail": {
    fontStyle: "normal",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "0.72rem",
    color: "var(--muted-foreground)",
    marginLeft: "auto",
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
  { tag: t.invalid, color: "var(--color-error)" },
]);

export const editorTheme: Extension = [chrome, syntaxHighlighting(highlight)];
