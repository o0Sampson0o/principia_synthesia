// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { serialize } from "next-mdx-remote/serialize";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkMath from "remark-math";

/**
 * `@/db` is mocked because importing `article-mdx` pulls the citation resolver
 * in with it — same reason as `article-mdx-compile.test.ts`.
 */
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { buildArticleMdxOptions } from "@/lib/article-mdx";
import { describeMdxError, mapRenderedLineToSource } from "@/lib/mdx-error";

const options = () => buildArticleMdxOptions({ slugToNumber: new Map(), resolved: new Map() });

/**
 * The defect this whole module exists for: the closing `$$` is glued to the end
 * of its content line, so the block never closes and every later `$$` is off by
 * one. The first casualty is the LaTeX brace group further down, which MDX then
 * reads as a JSX expression and hands to acorn.
 */
const BROKEN_BODY = [
  "# Range",
  "",
  "$$",
  "11111111_2=2^8-1=255$$",
  "",
  "## Fields",
  "",
  "$$",
  "\\underbrace{10000000}_\\text{biased exponent}",
  "$$",
  "",
  "Done.",
].join("\n");

const FRONTMATTER = ["---", "status: published", "canvas: null", "---", ""].join("\n");

/** Compile the way the published page does, returning whatever it throws. */
async function publishedFailure(source: string): Promise<unknown> {
  try {
    await serialize(source, options(), true);
  } catch (error) {
    return error;
  }
  throw new Error("expected the compile to fail, but it succeeded");
}

/**
 * Reproduce what the editor preview throws. `lib/preview-mdx-render.ts` runs
 * `unified().use(remarkParse).use(remarkMdx)…`, and an unparseable MDX
 * expression fails at the parse stage — before any of the rehype half runs — so
 * parsing alone is enough to get the same VFileMessage.
 */
function previewFailure(source: string): unknown {
  try {
    unified().use(remarkParse).use(remarkMdx).use(remarkMath).parse(source);
  } catch (error) {
    return error;
  }
  throw new Error("expected the parse to fail, but it succeeded");
}

describe("describeMdxError — published-page path", () => {
  it("recovers the line, column and code frame that next-mdx-remote drops", async () => {
    const error = await publishedFailure(BROKEN_BODY);
    // Precondition: the raw error really is the useless one.
    expect((error as Error).message).toContain("Could not parse expression with acorn");
    expect((error as Error).message).not.toMatch(/line \d+/i);

    const detail = await describeMdxError(
      error,
      { source: BROKEN_BODY, renderedBody: BROKEN_BODY },
      options().mdxOptions
    );

    expect(detail.reason).toContain("acorn");
    expect(detail.line).toBe(9);
    expect(detail.column).toBeGreaterThan(0);
    expect(detail.frame).toMatch(/^>\s+9 \| /m);
    expect(detail.frame).toContain("biased exponent");
    expect(detail.frame).toContain("^");
  });

  it("reports in the author's line numbers, not the stripped body's", async () => {
    // What the author edits vs what the compiler sees.
    const source = FRONTMATTER + BROKEN_BODY;
    const renderedBody = BROKEN_BODY;
    const offset = FRONTMATTER.split("\n").length - 1; // 5 lines of frontmatter block

    const error = await publishedFailure(renderedBody);
    const detail = await describeMdxError(error, { source, renderedBody }, options().mdxOptions);

    expect(detail.line).toBe(9 + offset);
    // The frame must be cut from the author's source, so its gutter agrees.
    expect(detail.frame).toMatch(new RegExp(`^>\\s+${9 + offset} \\| `, "m"));
    expect(detail.frame).toContain("biased exponent");
  });
});

describe("describeMdxError — editor-preview path", () => {
  it("uses the position already on the VFileMessage, without a recompile", async () => {
    const source = FRONTMATTER + BROKEN_BODY;
    const renderedBody = BROKEN_BODY;
    const error = previewFailure(renderedBody);

    // Precondition: unified hands back a positioned message.
    expect((error as { line?: number }).line).toBe(9);

    // No mdxOptions passed — it must not need them.
    const detail = await describeMdxError(error, { source, renderedBody });

    expect(detail.reason).toContain("acorn");
    expect(detail.line).toBe(9 + FRONTMATTER.split("\n").length - 1);
    expect(detail.frame).toContain("biased exponent");
  });
});

describe("describeMdxError — degradation", () => {
  it("strips the next-mdx-remote wrapper text from the reason", async () => {
    const detail = await describeMdxError(
      new Error(
        "[next-mdx-remote] error compiling MDX:\nSomething broke\n\nMore information: https://mdxjs.com/docs/troubleshooting-mdx"
      ),
      { source: "# fine\n", renderedBody: "# fine\n" },
      options().mdxOptions
    );
    expect(detail.reason).toBe("Something broke");
    expect(detail.line).toBeNull();
    expect(detail.frame).toBeNull();
  });

  it("never throws on a non-Error value", async () => {
    const detail = await describeMdxError("boom", { source: "# fine\n", renderedBody: "# fine\n" });
    expect(detail.reason).toBe("boom");
    expect(detail.line).toBeNull();
  });
});

describe("mapRenderedLineToSource", () => {
  const src = (...l: string[]) => l.join("\n");

  it("is the identity when nothing was stripped", () => {
    const s = src("a", "b", "c");
    expect(mapRenderedLineToSource({ source: s, renderedBody: s }, 2)).toBe(2);
  });

  it("shifts past stripped frontmatter", () => {
    const source = src("---", "x: 1", "---", "", "alpha", "beta");
    const renderedBody = src("alpha", "beta");
    expect(mapRenderedLineToSource({ source, renderedBody }, 1)).toBe(5);
    expect(mapRenderedLineToSource({ source, renderedBody }, 2)).toBe(6);
  });

  it("accounts for a prepended canvas line", () => {
    const source = src("---", "canvas: anim-x", "---", "", "alpha", "beta");
    const renderedBody = src('<DynamicAnimation slug="anim-x" />', "", "alpha", "beta");
    expect(mapRenderedLineToSource({ source, renderedBody }, 3)).toBe(5);
  });

  it("disambiguates a repeated line by proximity", () => {
    const source = src("---", "x: 1", "---", "", "$$", "a", "$$", "b", "$$", "c", "$$");
    const renderedBody = src("$$", "a", "$$", "b", "$$", "c", "$$");
    // rendered line 5 is the third `$$`; in source that is line 9.
    expect(mapRenderedLineToSource({ source, renderedBody }, 5)).toBe(9);
  });

  it("returns null for an out-of-range line", () => {
    const source = src("---", "x: 1", "---", "", "alpha");
    expect(mapRenderedLineToSource({ source, renderedBody: "alpha" }, 7)).toBeNull();
  });
});
