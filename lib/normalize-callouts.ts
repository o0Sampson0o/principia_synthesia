/**
 * Container syntax for callouts: `:::note` … `:::`.
 *
 * A callout is a blockquote carrying a `[!type]` marker (`lib/remark-callouts.ts`),
 * and CommonMark only lets a blockquote swallow *paragraph* text lazily. Tables,
 * `$$` blocks and fenced code are block structures, so every one of their lines
 * needs its own `>` — which makes the most useful callouts the most tedious to
 * write, and silently drops content out of the box when a prefix is missed.
 *
 * So authors write a container and this puts the prefixes in for them:
 *
 *     :::warning Overflow                 >  > [!warning] Overflow
 *     | bits | max |                      >  > | bits | max |
 *     | ---- | --- |            becomes   >  > | ---- | --- |
 *                                         >  >
 *     $$ 2^n - 1 $$                       >  > $$ 2^n - 1 $$
 *     :::                                 >
 *
 * Nothing downstream changes: by the time anything is parsed this *is* the
 * blockquote form, so the marker, the type set, the `+`/`-` foldable variants
 * and the `<details>` rendering all come from the existing plugin. The
 * blockquote spelling keeps working too — it degrades to a plain quote in
 * Obsidian and GitHub, which is why it was chosen.
 *
 * Runs on the raw source before parsing, like `normalizeDetailsBlocks`, and for
 * the same reason: by the time a tree exists the blockquote has already decided
 * what it contains.
 *
 * The closing `:::` becomes a blank line rather than being removed, so the
 * transformed body has exactly as many lines as the author's source and compile
 * errors keep reporting the line they typed (`lib/mdx-error.ts`).
 */

/**
 * `:::type`, optionally `+`/`-` then a title.
 *
 * Deliberately forgiving in two ways, because both are what people actually
 * type and neither is ambiguous:
 *
 *  - **Space after the colons.** `::: important Title` works as well as
 *    `:::important Title`. Requiring them flush is a rule with nothing behind
 *    it, and getting it wrong fails silently — the line renders as literal
 *    text, joined into the surrounding paragraph.
 *  - **More than three colons.** `::::note` is a convention elsewhere for
 *    nesting; here nesting is tracked by depth, so any run of three or more is
 *    simply a marker.
 *
 * The type is letters only — every callout type is a plain word — so a
 * trailing `-` can only be the foldable marker. Allowing `-` inside the name
 * makes `:::warning-` parse as a type called "warning-" and lose the fold.
 */
const OPEN_RE = /^:{3,}[ \t]*([a-zA-Z]+)([+-]?)[ \t]*(.*)$/;
/** A run of colons alone on the line closes the innermost container. */
const CLOSE_RE = /^:{3,}[ \t]*$/;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

export function normalizeCalloutContainers(src: string): string {
  if (!src.includes(":::")) return src; // fast path: nothing to do
  const lines = src.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  /** One `>` per open container, so nested callouts nest as nested quotes. */
  let depth = 0;

  const prefix = (line: string, n: number) => {
    if (n === 0) return line;
    const marker = "> ".repeat(n);
    // A blank line inside a quote still needs its markers, or the blockquote
    // ends there and the rest of the callout falls out of the box.
    return line.trim() === "" ? marker.trimEnd() : marker + line;
  };

  for (const line of lines) {
    // Fenced code is verbatim: a `:::` inside it is content, not a container.
    // Tracked before anything else so an unbalanced container cannot swallow it.
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      out.push(prefix(line, depth));
      continue;
    }
    if (fence !== null) {
      out.push(prefix(line, depth));
      continue;
    }

    const trimmed = line.trim();

    const open = OPEN_RE.exec(trimmed);
    if (open) {
      const [, type, fold, title] = open;
      const marker = `[!${type}]${fold}${title ? ` ${title}` : ""}`;
      // The opening line joins the container it opens, hence depth + 1.
      out.push(prefix(marker, depth + 1));
      depth++;
      continue;
    }

    if (depth > 0 && CLOSE_RE.test(trimmed)) {
      depth--;
      // Blank, not dropped: keeps the line count equal to the author's source.
      out.push("");
      continue;
    }

    out.push(prefix(line, depth));
  }

  return out.join("\n");
}
