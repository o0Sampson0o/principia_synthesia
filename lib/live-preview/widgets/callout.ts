import { WidgetType } from "@codemirror/view";
import { renderKatex } from "./math";
import { EMPTY_MACROS, type LiveMacros } from "../macros";
import { resolveRefsInFormula } from "@/lib/equation-refs";

/**
 * WYSIWYG callout rendering for live preview.
 *
 * Mirrors the published render (lib/remark-callouts.ts + globals.css): a
 * `> [!type] Title` blockquote becomes a `.callout` box with the `[!type]`
 * marker hidden and the body — including block math — rendered inside it.
 * The widget wraps everything in `.markdown-content` so it inherits the exact
 * callout box, title, prose, and KaTeX styling from globals.css.
 *
 * The body renderer is intentionally tiny (no markdown library): it handles
 * the inline/block constructs that appear in callouts and HTML-escapes every
 * text node. `renderCalloutBody` is exported pure for unit testing.
 */

// Obsidian's callout type set; unknown types fall back to "note". Kept in sync
// with lib/remark-callouts.ts, which owns the published render.
const KNOWN_TYPES = new Set([
  "note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important",
  "success", "check", "done", "question", "help", "faq", "warning", "caution",
  "attention", "failure", "fail", "missing", "danger", "error", "bug", "example", "quote", "cite",
]);

/** `[!type]`, optional `+`/`-` fold marker, optional title. */
const MARKER_RE = /^\[!(\w+)\]([+-]?)\s*(.*)$/;

/** Canonicalize a raw callout type; unknown → "note" (mirrors remark-callouts). */
export function canonicalType(raw: string): string {
  const t = raw.toLowerCase();
  return KNOWN_TYPES.has(t) ? t : "note";
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Render inline markdown to HTML: inline math `$…$`, `**bold**`, `*italic*` /
 * `_italic_`, `` `code` ``, and `[text](url)`. Everything else is emitted as an
 * escaped text node. Emphasis/link text recurses; code and math bodies do not.
 */
function renderInline(text: string, live: LiveMacros, eq: Map<string, number>): string {
  let html = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpExecArray | null;

    if ((m = /^`([^`]+)`/.exec(rest))) {
      html += `<code>${escapeHtml(m[1])}</code>`;
    } else if ((m = /^\$([^$]+)\$/.exec(rest))) {
      html += `<span class="cm-lp-math">${renderKatex(resolveRefsInFormula(m[1], eq), false, live)}</span>`;
    } else if ((m = /^\*\*([^*]+?)\*\*/.exec(rest))) {
      html += `<strong>${renderInline(m[1], live, eq)}</strong>`;
    } else if ((m = /^\*([^*]+?)\*/.exec(rest)) || (m = /^_([^_]+?)_/.exec(rest))) {
      html += `<em>${renderInline(m[1], live, eq)}</em>`;
    } else if ((m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest))) {
      html += `<a href="${escapeHtml(m[2])}">${renderInline(m[1], live, eq)}</a>`;
    } else {
      // Plain run: emit up to (but not including) the next markup sigil.
      const next = rest.slice(1).search(/[`$*_[]/);
      const take = next === -1 ? rest.length : next + 1;
      html += escapeHtml(rest.slice(0, take));
      i += take;
      continue;
    }
    i += m[0].length;
  }
  return html;
}

/** A list-item line: optional indent, a `-`/`*`/`+` or `1.`/`1)` marker, text. */
const LIST_ITEM_RE = /^[ \t]*([-*+]|\d+[.)])[ \t]+(.*)$/;

/**
 * Render one block (no blank lines inside) that isn't display math: a run of
 * list items becomes a `<ul>`/`<ol>`, and everything else joins into a `<p>`.
 * List and paragraph runs can alternate within the block (e.g. an intro line
 * immediately followed by bullets with no blank line between them).
 */
function renderBlock(block: string, live: LiveMacros, eq: Map<string, number>): string {
  const lines = block.split("\n");
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const first = LIST_ITEM_RE.exec(lines[i]);
    if (first) {
      // A list run: consecutive items sharing ordered-ness. A non-item line
      // that is indented continues the previous item (soft-wrapped text);
      // an un-indented one ends the list.
      const ordered = /\d/.test(first[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST_ITEM_RE.exec(lines[i]);
        if (m) {
          if (/\d/.test(m[1]) !== ordered) break; // ordered/unordered switch
          items.push(m[2]);
          i++;
        } else if (items.length && /^[ \t]+\S/.test(lines[i])) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        } else {
          break;
        }
      }
      const tag = ordered ? "ol" : "ul";
      html +=
        `<${tag}>` +
        items.map((it) => `<li>${renderInline(it, live, eq)}</li>`).join("") +
        `</${tag}>`;
    } else {
      // A paragraph run: gather until the next list item. Soft-wrapped source
      // lines join with spaces (line breaks aren't hard breaks in markdown).
      const para: string[] = [];
      while (i < lines.length && !LIST_ITEM_RE.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      const text = para.join(" ").replace(/[ \t]+/g, " ").trim();
      if (text) html += `<p>${renderInline(text, live, eq)}</p>`;
    }
  }
  return html;
}

/**
 * Render a callout body (its lines already stripped of the `>` quote marks and
 * the leading `[!type] title` marker line). Blocks are separated by blank
 * lines; a `$$…$$` block renders as display math, a run of `-`/`*`/`+` or
 * numbered lines as a list, everything else as a paragraph. Returns HTML.
 */
export function renderCalloutBody(
  bodyText: string,
  live: LiveMacros = EMPTY_MACROS,
  eq: Map<string, number> = new Map()
): string {
  let html = "";
  for (const raw of bodyText.split(/\n[ \t]*\n/)) {
    const block = raw.replace(/^\n+|\n+$/g, "");
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      const inner = trimmed.slice(2, -2).trim();
      html += `<div class="cm-lp-math-block">${renderKatex(resolveRefsInFormula(inner, eq), true, live)}</div>`;
    } else {
      html += renderBlock(block, live, eq);
    }
  }
  return html;
}

/**
 * Block widget replacing a `> [!type]` callout with its rendered box. `eq()`
 * compares the raw source so an unchanged callout keeps its DOM (and cached
 * KaTeX) across decoration rebuilds.
 */
export class CalloutWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly raw: string,
    readonly live: LiveMacros = EMPTY_MACROS,
    readonly eqNumbers: Map<string, number> = new Map()
  ) {
    super();
  }

  eq(other: CalloutWidget): boolean {
    return (
      other.type === this.type &&
      other.raw === this.raw &&
      // Macro version too: a callout's cached DOM holds rendered KaTeX.
      other.live.version === this.live.version
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "markdown-content cm-lp-callout-widget";

    const box = document.createElement("div");
    box.className = `callout callout-${this.type}`;
    box.setAttribute("data-callout", this.type);

    // Strip the leading `>`/`> ` from each quoted line, then peel off the
    // `[!type] title` marker line.
    const lines = this.raw.split("\n").map((l) => l.replace(/^\s*>\s?/, ""));
    const markerLine = (lines.shift() ?? "").trim();
    const marker = MARKER_RE.exec(markerLine);
    const title = marker
      ? marker[3].trim() ||
        marker[1].charAt(0).toUpperCase() + marker[1].slice(1).toLowerCase()
      : this.type.charAt(0).toUpperCase() + this.type.slice(1);

    const titleEl = document.createElement("p");
    titleEl.className = "callout-title";
    titleEl.textContent = title;
    box.appendChild(titleEl);

    // Render the body into a scratch node, then hoist its children so callout
    // body content are direct children of `.callout` (matches the published
    // DOM, where `> :last-child` resets the trailing margin).
    const scratch = document.createElement("div");
    scratch.innerHTML = renderCalloutBody(lines.join("\n"), this.live, this.eqNumbers);
    while (scratch.firstChild) box.appendChild(scratch.firstChild);

    container.appendChild(box);
    return container;
  }

  ignoreEvent(): boolean {
    return false; // clicks place the cursor → source reveals
  }
}
