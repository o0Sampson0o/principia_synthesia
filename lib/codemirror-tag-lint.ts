import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";

/**
 * Standard HTML element names that may appear as raw tags in article MDX.
 * A lowercase tag not in this set (e.g. the common `<detail>` typo for
 * `<details>`) renders as an unknown element with no behaviour, so we flag
 * it. Uppercase tags are MDX components and are left alone.
 */
const HTML_ELEMENTS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi",
  "bdo", "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code",
  "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog",
  "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr",
  "html", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li",
  "link", "main", "map", "mark", "menu", "meta", "meter", "nav", "noscript",
  "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre",
  "progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "section", "select",
  "slot", "small", "source", "span", "strong", "style", "sub", "summary", "sup",
  "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time",
  "title", "tr", "track", "u", "ul", "var", "video", "wbr",
]);

/** Node names whose text carries raw HTML tags in the markdown syntax tree. */
const HTML_NODES = new Set(["HTMLTag", "HTMLBlock"]);

/** Levenshtein distance, capped at `max` for early exit. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Closest known HTML element within edit distance 2, or null. */
function suggestElement(tag: string): string | null {
  let best: string | null = null;
  let bestDist = 3;
  for (const el of HTML_ELEMENTS) {
    const d = editDistance(tag, el, 2);
    if (d < bestDist) {
      bestDist = d;
      best = el;
    }
  }
  return best;
}

const TAG_RE = /<\/?([a-z][a-zA-Z0-9-]*)/g;

export function lintTags(state: EditorState): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (!HTML_NODES.has(node.name)) return;
      const text = doc.sliceString(node.from, node.to);
      TAG_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TAG_RE.exec(text)) !== null) {
        const tag = m[1];
        if (HTML_ELEMENTS.has(tag)) continue;
        // Position of the tag NAME (after `<` or `</`).
        const nameStart = node.from + m.index + m[0].length - tag.length;
        const nameEnd = nameStart + tag.length;
        const suggestion = suggestElement(tag);
        diagnostics.push({
          from: nameStart,
          to: nameEnd,
          severity: "warning",
          source: "html-tag",
          message: suggestion
            ? `Unknown HTML element <${tag}>. Did you mean <${suggestion}>?`
            : `Unknown HTML element <${tag}> — it won't render as anything.`,
          actions: suggestion
            ? [
                {
                  name: `Change to <${suggestion}>`,
                  apply(view: EditorView, from: number, to: number) {
                    view.dispatch({ changes: { from, to, insert: suggestion } });
                  },
                },
              ]
            : undefined,
        });
      }
    },
  });
  return diagnostics;
}

/**
 * CodeMirror linter that warns on unknown raw HTML elements in article MDX —
 * catching typos like `<detail>` for `<details>` that otherwise fail silently
 * (the browser renders an unknown tag with no behaviour). Offers a one-click
 * fix to the closest real element.
 */
export function htmlTagLinter() {
  return linter((view) => lintTags(view.state), { delay: 400 });
}
