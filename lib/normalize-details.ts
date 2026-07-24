/**
 * Both markdown pipelines mangle a `<details>`/`<summary>` block when the tags
 * sit flush against the markdown inside them — and they mangle it *differently*,
 * which is why the published article and the editor preview disagree:
 *
 *  - remark → rehype (editor "Preview" mode, EPUB, PDF) treats `<details>` as a
 *    CommonMark HTML block that swallows every following line until the first
 *    blank line as *raw* HTML. List markers there stay literal `-` text, so the
 *    bullets render as a dash-run paragraph.
 *  - MDX (the published page) parses the inner markdown, but wraps `<summary>`
 *    together with the text that follows it into a single `<p>`. `<summary>` is
 *    then no longer the first child of `<details>`, so the browser shows its
 *    default "Details" label and renders the orphaned `<summary>` (which is
 *    `display: list-item`) as a stray bullet.
 *
 * Both are fixed the same way: guarantee a blank line after `<details>`, around
 * a one-line `<summary>…</summary>`, and before `</details>`, so the markdown
 * between the tags is parsed as markdown — and `<summary>` stays the first
 * child — in every pipeline.
 *
 * This runs on the raw source *before* parsing: a remark/rehype plugin is too
 * late because the HTML block has already consumed the content by the time the
 * tree exists. The transform is non-destructive (the stored source is never
 * rewritten) and leaves anything inside fenced code blocks untouched.
 */

const DETAILS_OPEN_RE = /^<details\b[^>]*>$/i;
const SUMMARY_LINE_RE = /^<summary\b[^>]*>.*<\/summary>$/i;
const DETAILS_CLOSE_RE = /^<\/details>$/i;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

export function normalizeDetailsBlocks(src: string): string {
  if (!/<\/?details/i.test(src)) return src; // fast path: nothing to do
  const lines = src.split("\n");
  const out: string[] = [];
  let fence: string | null = null;

  const lastIsBlank = () => {
    const prev = out[out.length - 1];
    return prev === undefined || prev.trim() === "";
  };
  const nextIsBlank = (i: number) =>
    lines[i + 1] === undefined || lines[i + 1].trim() === "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code so tags inside ``` / ~~~ blocks are never touched.
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      continue;
    }

    const trimmed = line.trim();
    const isOpen = DETAILS_OPEN_RE.test(trimmed);
    const isSummary = SUMMARY_LINE_RE.test(trimmed);
    const isClose = DETAILS_CLOSE_RE.test(trimmed);

    // Blank line before a `<summary>` or the closing `</details>`.
    if ((isSummary || isClose) && !lastIsBlank()) out.push("");

    out.push(line);

    // Blank line after `<details>` or a one-line `<summary>`.
    if ((isOpen || isSummary) && !nextIsBlank(i)) out.push("");
  }

  return out.join("\n");
}
