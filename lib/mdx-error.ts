/**
 * Turning a failed MDX compile into something an author can act on.
 *
 * Two pipelines can fail, and they lose different things:
 *
 *  - The **published page** compiles with `next-mdx-remote`, which wraps the
 *    compiler failure in a plain `Error` and discards the `VFileMessage` that
 *    carried the position (see its `dist/format-mdx-error.js`). It only attaches
 *    a code frame when it can regex a position out of the message, which MDX 3
 *    no longer supplies. So all that survives is a bare reason like "Could not
 *    parse expression with acorn" — useless on a 600-line article. We recover
 *    the position by recompiling with `@mdx-js/mdx`, on the failure path only.
 *  - The **editor preview** (`lib/preview-mdx-render.ts`) runs `unified`
 *    directly, so the thrown value *is* a `VFileMessage` and already carries
 *    `line`/`column`. Nothing to recover — just don't throw it away.
 *
 * Both then hit the same trap: the compiler sees `prepareArticleBody`'s
 * *rendered* body, which has had frontmatter stripped and may have had a canvas
 * `<DynamicAnimation>` prepended. Its line numbers are offset from the source in
 * the author's editor, so a raw report sends them to the wrong line. Everything
 * here reports in **source** coordinates.
 */
import type { PluggableList } from "unified";

export interface MdxErrorDetail {
  /** Human-readable cause, stripped of the `next-mdx-remote` wrapper text. */
  reason: string;
  /** 1-based line in the *author's source*, when a position was recoverable. */
  line: number | null;
  /** 1-based column, when a position was recoverable. */
  column: number | null;
  /** A few source lines around `line`, with a caret under `column`. */
  frame: string | null;
}

/** The two views of the document a diagnostic has to reconcile. */
export interface MdxSources {
  /** What the author edits — frontmatter included. Line numbers report against this. */
  source: string;
  /** What the compiler actually saw: `prepareArticleBody().renderedBody`. */
  renderedBody: string;
}

/** Longest source line we echo into a frame before truncating. */
const MAX_FRAME_LINE = 200;

/** Lines of context shown above and below the offending line. */
const FRAME_CONTEXT = 2;

/**
 * Strip the `[next-mdx-remote] error compiling MDX:` preamble, any code frame
 * it managed to attach, and the docs footer, leaving just the reason.
 */
function cleanReason(message: string): string {
  return (
    message
      .replace(/^\[next-mdx-remote\] error compiling MDX:\s*/i, "")
      .replace(/\n+More information: https:\/\/mdxjs\.com\/docs\/troubleshooting-mdx\s*$/i, "")
      .trim()
      .split("\n")[0] || "The content could not be compiled."
  );
}

/**
 * Translate a line number in the rendered body back to the author's source.
 *
 * `prepareArticleBody` strips frontmatter and may prepend a canvas line — both
 * constant shifts — but `normalizeDetailsBlocks` can also *insert* blank lines
 * around `<details>` tags, which makes the mapping non-affine. So anchor on the
 * offending line's own text first and only fall back to the length difference,
 * which is exact whenever the `<details>` normalizer was a no-op (the common
 * case: it early-returns unless the source mentions `<details>`).
 *
 * Exported for tests.
 */
export function mapRenderedLineToSource(
  { source, renderedBody }: MdxSources,
  renderedLine: number
): number | null {
  if (source === renderedBody) return renderedLine;

  const rendered = renderedBody.split("\n");
  if (renderedLine < 1 || renderedLine > rendered.length) return null;
  const sourceLines = source.split("\n");

  /** Exact whenever the rendered body is the source shifted by a constant. */
  const estimate = renderedLine + (sourceLines.length - rendered.length);
  const inRange = (n: number) => (n >= 1 && n <= sourceLines.length ? n : null);

  const needle = rendered[renderedLine - 1];
  if (needle.trim() === "") return inRange(estimate);

  const hits: number[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    if (sourceLines[i] === needle) hits.push(i + 1);
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    // Repeated line (e.g. a bare `$$`): take the one nearest the estimate.
    return hits.reduce((a, b) => (Math.abs(b - estimate) < Math.abs(a - estimate) ? b : a));
  }
  return inRange(estimate);
}

function buildFrame(source: string, line: number, column: number | null): string | null {
  const lines = source.split("\n");
  if (line < 1 || line > lines.length) return null;

  const start = Math.max(0, line - 1 - FRAME_CONTEXT);
  const end = Math.min(lines.length, line + FRAME_CONTEXT);
  const gutter = String(end).length;
  const out: string[] = [];

  for (let i = start; i < end; i++) {
    const n = i + 1;
    const text = lines[i].length > MAX_FRAME_LINE ? `${lines[i].slice(0, MAX_FRAME_LINE)}…` : lines[i];
    out.push(`${n === line ? ">" : " "} ${String(n).padStart(gutter)} | ${text}`);
    if (n === line && column !== null && column > 0 && column <= MAX_FRAME_LINE + 1) {
      out.push(`  ${" ".repeat(gutter)} | ${" ".repeat(column - 1)}^`);
    }
  }

  return out.join("\n");
}

/** Read `line`/`column` off a thrown value that already carries them (VFileMessage). */
function positionOf(error: unknown): { line: number; column: number | null } | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { line?: unknown; column?: unknown; place?: { line?: unknown; column?: unknown } };
  const raw = typeof e.line === "number" ? e : e.place;
  if (!raw || typeof raw.line !== "number") return null;
  return { line: raw.line, column: typeof raw.column === "number" ? raw.column : null };
}

/**
 * Describe why a document failed to compile, in the author's line numbers.
 *
 * `error` is whatever the pipeline threw. `mdxOptions` is only needed for the
 * published-page path, where the position has to be recovered by recompiling;
 * omit it when the thrown value already carries a position. Never throws — a
 * diagnostic that crashes defeats the point.
 */
export async function describeMdxError(
  error: unknown,
  sources: MdxSources,
  mdxOptions?: { remarkPlugins: PluggableList; rehypePlugins: PluggableList }
): Promise<MdxErrorDetail> {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const reasonOf = (e: unknown) => {
    const r = (e as { reason?: unknown } | null)?.reason;
    return typeof r === "string" && r.trim() !== "" ? r : cleanReason(rawMessage);
  };

  const locate = (pos: { line: number; column: number | null } | null, reason: string): MdxErrorDetail => {
    if (!pos) return { reason, line: null, column: null, frame: null };
    const line = mapRenderedLineToSource(sources, pos.line);
    if (line === null) return { reason, line: null, column: null, frame: null };
    return { reason, line, column: pos.column, frame: buildFrame(sources.source, line, pos.column) };
  };

  // Editor-preview path: the VFileMessage came through intact.
  const direct = positionOf(error);
  if (direct) return locate(direct, reasonOf(error));

  // Published-page path: position was stripped. Recover it, if we can.
  if (!mdxOptions) return locate(null, reasonOf(error));
  try {
    const { compile } = await import("@mdx-js/mdx");
    await compile(sources.renderedBody, mdxOptions);
    // The recompile succeeded, so the failure came from evaluating the compiled
    // module rather than from parsing it. No position to recover.
    return locate(null, cleanReason(rawMessage));
  } catch (recompiled) {
    return locate(positionOf(recompiled), reasonOf(recompiled));
  }
}
