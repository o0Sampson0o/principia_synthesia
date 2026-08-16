/**
 * Turning a failed MDX compile into something an author can act on.
 *
 * `next-mdx-remote` wraps compiler failures in a plain `Error` and throws away
 * the `VFileMessage` that carried them (see `dist/format-mdx-error.js`), so all
 * that survives is a bare reason like "Could not parse expression with acorn" —
 * useless on a 600-line article. It also only builds a code frame when it can
 * regex a position out of the message, which MDX 3 no longer puts there.
 *
 * So on the failure path we recompile with `@mdx-js/mdx` directly to recover
 * the position, then build our own frame. This is deliberately only reachable
 * when a compile has *already* failed — the happy path never pays for it.
 */
import type { PluggableList } from "unified";

export interface MdxErrorDetail {
  /** Human-readable cause, stripped of the `next-mdx-remote` wrapper text. */
  reason: string;
  /** 1-based line in the *rendered* body, when the compiler reported one. */
  line: number | null;
  /** 1-based column, when the compiler reported one. */
  column: number | null;
  /** A few lines of source around `line`, with a caret under `column`. */
  frame: string | null;
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

/**
 * Describe why `source` failed to compile.
 *
 * `error` is whatever `compileMDX` threw; `mdxOptions` must be the same options
 * it was given, so the recompile fails at the same place. Never throws — a
 * diagnostic that crashes defeats the point.
 */
export async function describeMdxError(
  error: unknown,
  source: string,
  mdxOptions: { remarkPlugins: PluggableList; rehypePlugins: PluggableList }
): Promise<MdxErrorDetail> {
  const fallback: MdxErrorDetail = {
    reason: cleanReason(error instanceof Error ? error.message : String(error)),
    line: null,
    column: null,
    frame: null,
  };

  try {
    const { compile } = await import("@mdx-js/mdx");
    await compile(source, mdxOptions);
    // The recompile succeeded, so the original failure came from evaluating the
    // compiled module rather than from parsing. No position to recover.
    return fallback;
  } catch (recompiled) {
    if (!recompiled || typeof recompiled !== "object") return fallback;
    const vmsg = recompiled as { reason?: string; message?: string; line?: number; column?: number };
    const line = typeof vmsg.line === "number" ? vmsg.line : null;
    const column = typeof vmsg.column === "number" ? vmsg.column : null;
    return {
      reason: vmsg.reason ?? cleanReason(vmsg.message ?? fallback.reason),
      line,
      column,
      frame: line !== null ? buildFrame(source, line, column) : null,
    };
  }
}
