/**
 * Author-defined KaTeX macros, at article and book level.
 *
 * An article declares macros in a fenced block:
 *
 *     ```katex
 *     \gdef\dd{\frac{d}{dt}}
 *     \newcommand{\deriv}[1]{\frac{d#1}{dt}}
 *     ```
 *
 * and uses them in any math below (or above — the block is collected before
 * anything renders, so placement is free). The fence itself renders to nothing;
 * `remarkFencedEmbeds` drops it, in the export pipelines too, so a book never
 * prints a page of macro definitions.
 *
 * ## Why definitions are *rendered* rather than parsed
 *
 * KaTeX already knows how to read `\gdef`/`\newcommand`/`\def`, including
 * parameterised forms, and it writes what it learns into the `macros` object it
 * was handed. So the definitions are rendered once into a throwaway string and
 * the populated object is what gets passed to `rehype-katex`. Parsing TeX
 * definitions by hand would be a worse version of what the renderer does.
 *
 * `globalGroup: true` is the load-bearing flag: without it only `\gdef` escapes
 * the expression, and `\newcommand` — the spelling most authors reach for —
 * silently defines nothing. It is set *only* while reading a definitions block,
 * so a stray `\def` inside ordinary prose math keeps its normal local scope.
 */
import katex from "katex";

/**
 * A populated KaTeX macro table.
 *
 * Not `Record<string, string>`: KaTeX stores what it learns from `\gdef` and
 * friends as expanded token objects, not as the source text it read.
 */
export type KatexMacros = NonNullable<katex.KatexOptions["macros"]>;

/** The fence language that marks a definitions block. */
export const MACRO_FENCE_LANG = "katex";

/**
 * Cap on the definition source fed to KaTeX, per document. Macro expansion is
 * the one part of KaTeX that can be made to do unbounded work, and this text
 * comes from an author, so it gets a ceiling rather than trust.
 */
const MAX_MACRO_SOURCE = 8_000;

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`~]*)/;

/**
 * Collect the contents of every ```katex fence in `body`.
 *
 * Scans line by line and tracks fence state, so a ```katex block shown *inside*
 * a longer ```` ```` ```` example is left alone. Deliberately reads the raw
 * source instead of the parsed tree: the macros have to be known before
 * `rehype-katex` is configured, which happens before anything is parsed.
 */
export function extractMacroSource(body: string): string {
  const lines = body.split("\n");
  const collected: string[] = [];
  let fence: { marker: string; length: number; isMacro: boolean } | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const match = FENCE_RE.exec(line);

    if (fence === null) {
      if (!match) continue;
      const marker = match[2][0];
      fence = {
        marker,
        length: match[2].length,
        isMacro: match[3].toLowerCase() === MACRO_FENCE_LANG,
      };
      buffer = [];
      continue;
    }

    // Inside a fence: only a closing run of the same marker, at least as long
    // as the opener and with no info string, ends it.
    const isClose =
      match !== null &&
      match[2][0] === fence.marker &&
      match[2].length >= fence.length &&
      match[3] === "";
    if (isClose) {
      if (fence.isMacro) collected.push(buffer.join("\n"));
      fence = null;
      buffer = [];
      continue;
    }
    if (fence.isMacro) buffer.push(line);
  }

  // An unclosed fence at EOF still counts — the parser treats it as closing.
  if (fence?.isMacro) collected.push(buffer.join("\n"));

  return collected.join("\n");
}

/** Start of a TeX definition — where a definitions block can be cut apart. */
const DEFINITION_START = /(?=\\(?:newcommand|renewcommand|providecommand|gdef|edef|xdef|def)\b)/;

/**
 * Split a definitions block into one chunk per definition.
 *
 * Only used as a fallback, because the split is naive: a `\def` nested inside
 * another macro's body would be cut in the wrong place. The whole block is
 * always tried intact first, so a well-formed source never reaches this.
 */
function splitDefinitions(source: string): string[] {
  return source.split(DEFINITION_START).filter((chunk) => chunk.trim().length > 0);
}

/**
 * Build the `macros` object for `rehype-katex` from definition sources.
 *
 * Sources are applied in order, so later ones win: pass the book's definitions
 * first and the article's second, and an article can shadow a book macro.
 * Never throws — a bad definition costs the author that macro, not the page.
 *
 * The block is rendered intact first. If that fails, the definitions are
 * applied one at a time: KaTeX stops at the first parse error, so a single
 * malformed definition used to silently discard every definition *after* it.
 * A book whose first macro KaTeX cannot read would lose all of them at once,
 * with nothing to distinguish it from macros that were never set.
 */
export function buildKatexMacros(...sources: Array<string | null | undefined>): KatexMacros {
  const macros: KatexMacros = {};

  const apply = (src: string): boolean => {
    try {
      katex.renderToString(src, {
        macros,
        globalGroup: true,
        // Throwing is what makes a failure detectable here; the caller still
        // never sees one, because every call site is wrapped.
        throwOnError: true,
        displayMode: true,
      });
      return true;
    } catch {
      return false;
    }
  };

  for (const source of sources) {
    const trimmed = source?.trim();
    if (!trimmed) continue;
    const capped = trimmed.slice(0, MAX_MACRO_SOURCE);
    if (apply(capped)) continue;
    // Salvage the definitions that are individually fine.
    for (const chunk of splitDefinitions(capped)) apply(chunk);
  }

  return macros;
}
