/**
 * `\label` / `\eqref` / `\ref` for display equations.
 *
 * KaTeX has none of these, and cannot: it renders each formula in isolation
 * with no document context, so it has nothing to number against. Its own
 * numbering is not in the HTML either — `<span class="eqn-num">` is empty and
 * the visible "(1)" comes from a CSS counter (katex.css: `counter-increment:
 * katexEqnNo`). Nothing server-side can read those numbers back.
 *
 * So numbering is taken over here rather than observed. Every numbered row is
 * given an explicit `\tag{…}`, which suppresses KaTeX's counter for that row —
 * meaning the number a reader sees is the number computed here, and a `\eqref`
 * can never disagree with the equation it points at. It also puts the number
 * in the HTML as text, which the CSS counter never did: it survives copy,
 * export and screen readers.
 *
 * Numbering follows KaTeX's own rules, verified against it:
 *   - `equation`, `align`, `alignat`, `gather`, `flalign`, `eqnarray` number
 *     every row; their starred forms number none
 *   - a bare `$$ … $$` with no environment is not numbered
 *   - `\nonumber` / `\notag` skips a row; an author's own `\tag` replaces it
 *
 * Row splitting is environment-aware. A `\\` inside a nested `\begin{cases}`
 * (or `matrix`, `array`, …) is not a row break in the outer environment, and
 * treating it as one would shift every later equation number.
 */

/** Environments whose rows carry equation numbers. */
const NUMBERED_ENVIRONMENTS = new Set([
  "equation",
  "align",
  "alignat",
  "gather",
  "flalign",
  "eqnarray",
]);

export interface EquationRefResult {
  /** Source with labels stripped, numbers tagged, and references resolved. */
  source: string;
  /** Label → equation number, for callers that need the mapping itself. */
  numbers: Map<string, number>;
  /** Labels referenced by `\eqref`/`\ref` that were never defined. */
  unresolved: string[];
  /** Rewritten TeX per formula, keyed by the formula's start offset. */
  byOffset: Map<number, string>;
}

type Segment =
  | { kind: "text" | "code"; text: string; contentStart: number }
  | {
      kind: "inlineMath" | "displayMath";
      text: string;
      open: string;
      close: string;
      /** Offset of the formula itself, past the opening delimiter. Lets the
       *  editor match its own math nodes to these results by position. */
      contentStart: number;
    };

/**
 * Split source into code / math / prose runs.
 *
 * Code is isolated first and never rewritten: a fenced block may legitimately
 * contain `$$` or `\label` as sample text.
 */
export function segmentSource(source: string): Segment[] {
  const segments: Segment[] = [];
  let buf = "";
  let i = 0;

  let bufStart = 0;
  const flush = () => {
    if (buf) segments.push({ kind: "text", text: buf, contentStart: bufStart });
    buf = "";
  };

  while (i < source.length) {
    const rest = source.slice(i);

    // Fenced code block (``` or ~~~), to its closing fence or end of input.
    const fence = /^(?:^|\n)([ \t]*)(`{3,}|~{3,})/.exec(
      i === 0 ? `\n${rest}` : source.slice(i - 1)
    );
    if (fence && fence.index === 0) {
      const marker = fence[2];
      const start = i;
      const afterOpen = source.indexOf("\n", i);
      const closeIdx =
        afterOpen === -1 ? -1 : source.indexOf(`\n${fence[1]}${marker}`, afterOpen);
      const end = closeIdx === -1 ? source.length : closeIdx + 1 + fence[1].length + marker.length;
      flush();
      segments.push({ kind: "code", text: source.slice(start, end), contentStart: start });
      i = end;
      continue;
    }

    // Inline code span.
    if (source[i] === "`") {
      const ticks = /^`+/.exec(rest)![0];
      const close = source.indexOf(ticks, i + ticks.length);
      const end = close === -1 ? source.length : close + ticks.length;
      flush();
      segments.push({ kind: "code", text: source.slice(i, end), contentStart: i });
      i = end;
      continue;
    }

    // Escaped dollar is literal, never a delimiter.
    if (source[i] === "\\" && source[i + 1] === "$") {
      buf += source.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (source.startsWith("$$", i)) {
      const close = source.indexOf("$$", i + 2);
      if (close !== -1) {
        flush();
        segments.push({
          kind: "displayMath",
          text: source.slice(i + 2, close),
          open: "$$",
          close: "$$",
          contentStart: i + 2,
        });
        i = close + 2;
        continue;
      }
    }

    if (source[i] === "$") {
      // Inline math: no blank line inside, closed by an unescaped `$`.
      let j = i + 1;
      let found = -1;
      while (j < source.length) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === "$") { found = j; break; }
        if (source.startsWith("\n\n", j)) break;
        j++;
      }
      if (found !== -1 && found > i + 1) {
        flush();
        segments.push({
          kind: "inlineMath",
          text: source.slice(i + 1, found),
          open: "$",
          close: "$",
          contentStart: i + 1,
        });
        i = found + 1;
        continue;
      }
    }

    if (!buf) bufStart = i;
    buf += source[i];
    i++;
  }

  flush();
  return segments;
}

/** The environment a display block opens with, if any. */
function outerEnvironment(tex: string): string | null {
  const m = /^\s*\\begin\{([A-Za-z*]+)\}/.exec(tex);
  return m ? m[1] : null;
}

/**
 * Split an environment body into rows at top-level `\\` only.
 *
 * Depth counts nested `\begin`/`\end`, so the `\\` separating cases inside
 * `\begin{cases}` does not end a row of the enclosing `align`.
 */
export function splitRows(body: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;

  while (i < body.length) {
    if (body[i] === "\\") {
      const begin = /^\\begin\{[A-Za-z*]+\}/.exec(body.slice(i));
      if (begin) { depth++; i += begin[0].length; continue; }
      const end = /^\\end\{[A-Za-z*]+\}/.exec(body.slice(i));
      if (end) { depth--; i += end[0].length; continue; }
      if (body[i + 1] === "\\") {
        if (depth === 0) {
          rows.push(body.slice(start, i));
          i += 2;
          start = i;
          continue;
        }
        i += 2;
        continue;
      }
      // Any other control sequence: skip its name so `\\` inside it is not
      // mistaken for a row break.
      const cs = /^\\[A-Za-z]+/.exec(body.slice(i));
      i += cs ? cs[0].length : 2;
      continue;
    }
    i++;
  }
  rows.push(body.slice(start));
  return rows;
}

const LABEL_RE = /\\label\s*\{([^}]*)\}/g;
const REF_RE = /\\(eqref|ref)\s*\{([^}]*)\}/g;

/** A row is unnumbered if it opts out, and self-numbered if it tags itself. */
function rowFlags(row: string) {
  return {
    suppressed: /\\(nonumber|notag)\b/.test(row),
    selfTagged: /\\tag\s*\{/.test(row),
  };
}

/**
 * Resolve equation references across one document.
 *
 * Two passes: number every display equation and record its labels, then
 * rewrite the references now that all numbers are known — a `\eqref` may point
 * forward to an equation further down the page.
 */
export function resolveEquationRefs(source: string): EquationRefResult {
  const segments = segmentSource(source);
  const numbers = new Map<string, number>();
  const byOffset = new Map<number, string>();
  let counter = 0;

  // ── Pass 1: number rows, collect labels, rewrite the math itself ─────────
  const rewritten = segments.map((seg) => {
    if (seg.kind !== "displayMath") return seg;

    const env = outerEnvironment(seg.text);
    const bare = env ? env.replace(/\*$/, "") : null;
    const numbered = bare !== null && !env!.endsWith("*") && NUMBERED_ENVIRONMENTS.has(bare);
    if (!numbered) {
      // Unnumbered block: a label here can point at nothing, so drop it
      // rather than let KaTeX render \label as an error.
      return { ...seg, text: seg.text.replace(LABEL_RE, "") };
    }

    const open = /^\s*\\begin\{[A-Za-z*]+\}/.exec(seg.text)![0];
    const closeMatch = /\\end\{[A-Za-z*]+\}\s*$/.exec(seg.text);
    const close = closeMatch ? closeMatch[0] : "";
    const body = seg.text.slice(open.length, seg.text.length - close.length);

    const rows = splitRows(body).map((row) => {
      const { suppressed, selfTagged } = rowFlags(row);
      const labels: string[] = [];
      let stripped = row.replace(LABEL_RE, (_m, key: string) => {
        const k = key.trim();
        if (k) labels.push(k);
        return "";
      });

      if (suppressed) return stripped;

      if (selfTagged) {
        // The author's own \tag wins; its label still needs an anchor, but
        // there is no number of ours to attach, so it points at the block.
        for (const k of labels) numbers.set(k, counter);
        return stripped;
      }

      counter += 1;
      for (const k of labels) numbers.set(k, counter);

      // \htmlId puts the anchor on the number itself, so a reference lands on
      // the exact row rather than the top of a multi-row block.
      const anchor = labels[0];
      const tag = anchor
        ? `\\tag{\\htmlId{eq-${cssEscape(anchor)}}{${counter}}}`
        : `\\tag{${counter}}`;
      stripped = `${stripped.replace(/\s*$/, "")} ${tag}`;
      return stripped;
    });

    return { ...seg, text: `${open}${rows.join("\\\\")}${close}` };
  });

  // ── Pass 2: resolve references, now that every number is known ───────────
  const unresolved: string[] = [];
  const out = rewritten
    .map((seg) => {
      if (seg.kind === "code") return seg.text;

      if (seg.kind === "text") {
        // Prose: a markdown link, since TeX commands do not render here.
        return seg.text.replace(REF_RE, (whole, _cmd: string, key: string) => {
          const k = key.trim();
          const n = numbers.get(k);
          if (n === undefined) { unresolved.push(k); return whole; }
          return `[(${n})](#eq-${cssEscape(k)})`;
        });
      }

      // Narrowed by elimination above: only the two math kinds remain, and
      // both carry their delimiters.
      const math = seg as Extract<Segment, { open: string }>;
      const body = math.text.replace(REF_RE, (whole, _cmd: string, key: string) => {
        const k = key.trim();
        const n = numbers.get(k);
        if (n === undefined) { unresolved.push(k); return whole; }
        return `\\href{#eq-${cssEscape(k)}}{(${n})}`;
      });
      // The editor renders one formula at a time and needs this by position.
      byOffset.set(math.contentStart, body);
      return `${math.open}${body}${math.close}`;
    })
    .join("");

  return { source: out, numbers, unresolved: [...new Set(unresolved)], byOffset };
}

/**
 * The rewritten TeX for every formula in a document, keyed by the offset of
 * the formula's first character.
 *
 * The live editor finds math with its own syntax tree, so it cannot reuse the
 * rewritten source wholesale — it needs the replacement for one formula at a
 * time, matched by position.
 */
export function equationTransforms(source: string): {
  byOffset: Map<number, string>;
  numbers: Map<string, number>;
} {
  const { byOffset, numbers } = resolveEquationRefs(source);
  return { byOffset, numbers };
}

/** Keep a label usable as an HTML id and inside a TeX group. */
function cssEscape(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "-");
}
