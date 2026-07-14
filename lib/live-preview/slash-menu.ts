import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Notion-style "/" slash menu. Typing "/" at the start of an (otherwise
 * empty) line opens a searchable list of block types; picking one replaces
 * the "/query" with the block's markdown. The document stays plain markdown —
 * this is a pure insert affordance.
 */

interface BlockCommand {
  label: string;
  detail: string;
  keywords: string;
  /** Completion `type` — drives the row's glyph token (see theme.ts). */
  type: string;
  /** Text inserted in place of the "/…". `$` marks the final cursor position. */
  insert: string;
}

const COMMANDS: BlockCommand[] = [
  { label: "Heading 1", detail: "# ", keywords: "h1 title", type: "h1", insert: "# $" },
  { label: "Heading 2", detail: "## ", keywords: "h2", type: "h2", insert: "## $" },
  { label: "Heading 3", detail: "### ", keywords: "h3", type: "h3", insert: "### $" },
  { label: "Bullet list", detail: "- ", keywords: "ul unordered", type: "ul", insert: "- $" },
  { label: "Numbered list", detail: "1. ", keywords: "ol ordered", type: "ol", insert: "1. $" },
  { label: "To-do", detail: "- [ ] ", keywords: "task checkbox", type: "todo", insert: "- [ ] $" },
  { label: "Quote", detail: "> ", keywords: "blockquote", type: "quote", insert: "> $" },
  { label: "Callout", detail: "> [!note]", keywords: "admonition info note", type: "callout", insert: "> [!note] $\n> " },
  { label: "Toggle", detail: "<details>", keywords: "details fold collapse", type: "toggle", insert: "<details>\n<summary>$</summary>\n\n\n</details>" },
  { label: "Code block", detail: "``` ```", keywords: "fence", type: "code", insert: "```\n$\n```" },
  { label: "Divider", detail: "---", keywords: "hr rule separator", type: "hr", insert: "---\n\n$" },
  { label: "Table", detail: "grid", keywords: "columns", type: "table", insert: "| $ |  |\n| --- | --- |\n|  |  |" },
  { label: "Math block", detail: "$$ $$", keywords: "latex equation", type: "math", insert: "$$\n$\n$$" },
  { label: "Wikilink", detail: "[[…]]", keywords: "link reference", type: "wikilink", insert: "[[$]]" },
];

function applyBlock(insert: string) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const caret = insert.indexOf("$");
    const text = insert.replace("$", "");
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (caret === -1 ? text.length : caret) },
    });
  };
}

// Completion objects for display, paired with a hidden keyword blob used only
// for filtering (kept out of the Completion so it never renders).
const OPTIONS: { completion: Completion; haystack: string }[] = COMMANDS.map((c) => ({
  completion: {
    label: c.label,
    detail: c.detail,
    type: c.type,
    apply: applyBlock(c.insert),
  },
  haystack: `${c.label} ${c.keywords}`.toLowerCase(),
}));

/**
 * Given the line text up to the cursor, decide whether the slash menu should
 * open and what the query is. Fires only when "/" begins the block content
 * (start of line, after list/quote marks) — "/" mid-sentence is left alone.
 * Exported for unit testing.
 */
export function matchSlashQuery(before: string): { query: string } | null {
  const m = /(?:^|\s)\/(\w*)$/.exec(before);
  if (!m) return null;
  const beforeSlash = before.slice(0, before.lastIndexOf("/"));
  if (!/^[\s>*-]*$/.test(beforeSlash)) return null;
  return { query: m[1].toLowerCase() };
}

/** Filters the block commands by a slash query (label + keyword match). */
export function filterSlashCommands(query: string): Completion[] {
  return OPTIONS.filter((o) => !query || o.haystack.includes(query)).map((o) => o.completion);
}

function slashSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const match = matchSlashQuery(before);
  if (!match) return null;

  const options = filterSlashCommands(match.query);
  if (options.length === 0) return null;
  const from = context.pos - match.query.length - 1; // include the "/"
  return { from, options, filter: false };
}

export const slashMenu: Extension = autocompletion({
  override: [slashSource],
  icons: true,
  defaultKeymap: true,
});
