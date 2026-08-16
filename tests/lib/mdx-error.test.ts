// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { serialize } from "next-mdx-remote/serialize";

/**
 * `@/db` is mocked because importing `article-mdx` pulls the citation resolver
 * in with it — same reason as `article-mdx-compile.test.ts`.
 */
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { buildArticleMdxOptions } from "@/lib/article-mdx";
import { describeMdxError } from "@/lib/mdx-error";

const options = () => buildArticleMdxOptions({ slugToNumber: new Map(), resolved: new Map() });

/** Compile the way the published page does, returning whatever it throws. */
async function failedCompile(source: string): Promise<unknown> {
  try {
    await serialize(source, options(), true);
  } catch (error) {
    return error;
  }
  throw new Error("expected the compile to fail, but it succeeded");
}

describe("describeMdxError", () => {
  it("recovers the line, column and a code frame that next-mdx-remote drops", async () => {
    // An unbalanced display-math fence: the closing `$$` is glued to the end of
    // the content line, so the block never closes and every later `$$` is off
    // by one. The first casualty is the LaTeX brace group below, which MDX then
    // reads as a JSX expression and hands to acorn.
    const source = [
      "# Range",
      "",
      "$$",
      "11111111_2=2^8-1=255$$",
      "",
      "## Fields",
      "",
      "$$",
      "\\underbrace{0}_{\\text{sign}}",
      "$$",
      "",
      "Done.",
    ].join("\n");

    const error = await failedCompile(source);
    // Precondition: the raw error really is the useless one.
    expect((error as Error).message).toContain("Could not parse expression with acorn");
    expect((error as Error).message).not.toMatch(/line \d+/i);

    const detail = await describeMdxError(error, source, options().mdxOptions);

    expect(detail.reason).toContain("acorn");
    expect(detail.line).toBe(9);
    expect(detail.column).toBeGreaterThan(0);
    expect(detail.frame).toMatch(/^>\s+9 \| /m);
    expect(detail.frame).toContain("\\underbrace{0}_{\\text{sign}}");
    expect(detail.frame).toContain("^");
  });

  it("strips the next-mdx-remote wrapper text from the reason", async () => {
    const detail = await describeMdxError(
      new Error(
        "[next-mdx-remote] error compiling MDX:\nSomething broke\n\nMore information: https://mdxjs.com/docs/troubleshooting-mdx"
      ),
      "# fine\n",
      options().mdxOptions
    );
    expect(detail.reason).toBe("Something broke");
    expect(detail.line).toBeNull();
    expect(detail.frame).toBeNull();
  });

  it("never throws on a non-Error value", async () => {
    const detail = await describeMdxError("boom", "# fine\n", options().mdxOptions);
    expect(detail.reason).toBe("boom");
  });
});
