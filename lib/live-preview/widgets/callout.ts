import { WidgetType } from "@codemirror/view";
import { renderKatex } from "./math";

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
function renderInline(text: string): string {
  let html = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpExecArray | null;

    if ((m = /^`([^`]+)`/.exec(rest))) {
      html += `<code>${escapeHtml(m[1])}</code>`;
    } else if ((m = /^\$([^$]+)\$/.exec(rest))) {
      html += `<span class="cm-lp-math">${renderKatex(m[1], false)}</span>`;
    } else if ((m = /^\*\*([^*]+?)\*\*/.exec(rest))) {
      html += `<strong>${renderInline(m[1])}</strong>`;
    } else if ((m = /^\*([^*]+?)\*/.exec(rest)) || (m = /^_([^_]+?)_/.exec(rest))) {
      html += `<em>${renderInline(m[1])}</em>`;
    } else if ((m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest))) {
      html += `<a href="${escapeHtml(m[2])}">${renderInline(m[1])}</a>`;
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

/**
 * Render a callout body (its lines already stripped of the `>` quote marks and
 * the leading `[!type] title` marker line). Blocks are separated by blank
 * lines; a `$$…$$` block renders as display math, everything else as a
 * paragraph. Returns an HTML string.
 */
export function renderCalloutBody(bodyText: string): string {
  let html = "";
  for (const raw of bodyText.split(/\n[ \t]*\n/)) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith("$$") && block.endsWith("$$") && block.length > 4) {
      const inner = block.slice(2, -2).trim();
      html += `<div class="cm-lp-math-block">${renderKatex(inner, true)}</div>`;
    } else {
      // Soft-wrapped lines join into one paragraph (source line breaks are
      // not hard breaks in markdown).
      html += `<p>${renderInline(block.replace(/\n[ \t]*/g, " "))}</p>`;
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
    readonly raw: string
  ) {
    super();
  }

  eq(other: CalloutWidget): boolean {
    return other.type === this.type && other.raw === this.raw;
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
    scratch.innerHTML = renderCalloutBody(lines.join("\n"));
    while (scratch.firstChild) box.appendChild(scratch.firstChild);

    container.appendChild(box);
    return container;
  }

  ignoreEvent(): boolean {
    return false; // clicks place the cursor → source reveals
  }
}
