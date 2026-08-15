// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { compile } from "@mdx-js/mdx";

/**
 * The published-page half of `lib/article-mdx.tsx`.
 *
 * `tests/lib/article-mdx.test.ts` covers the editor Preview, which renders the
 * same source through `unified` — a different engine that can silently agree
 * with the plugins while real MDX compilation chokes on them. These compile the
 * source the way the published page does (`next-mdx-remote` is a thin wrapper
 * around `@mdx-js/mdx` `compile`) so a plugin that emits an AST node MDX cannot
 * turn into JSX fails here rather than on a live article.
 *
 * `@/db` is mocked because importing `article-mdx` pulls the citation resolver
 * in with it.
 */
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { buildArticleMdxOptions } from "@/lib/article-mdx";

/** Compiles `source` exactly as the article page would. */
async function compileArticle(source: string): Promise<string> {
  const { mdxOptions } = buildArticleMdxOptions({
    slugToNumber: new Map(),
    resolved: new Map(),
  });
  const file = await compile(source, {
    ...mdxOptions,
    outputFormat: "function-body",
  });
  return String(file);
}

describe("buildArticleMdxOptions (published-page compilation)", () => {
  it("compiles a ```mermaid fence into a <MermaidBlock> component call", async () => {
    const code = await compileArticle("```mermaid\ngraph TD;\n  A-->B;\n```");
    expect(code).toContain("MermaidBlock");
    expect(code).toContain("graph TD;");
  });

  it("compiles a ```animation fence into an <InlineAnimation> component call", async () => {
    const code = await compileArticle("```animation height=520\nfunction Wave() {}\n```");
    expect(code).toContain("InlineAnimation");
    expect(code).toContain("function Wave() {}");
    expect(code).toContain("520");
  });

  it("keeps quotes and braces in fenced code from breaking compilation", async () => {
    // Braces and quotes are JSX-significant; the fence content must survive as
    // data rather than being parsed as expressions.
    const code = await compileArticle(
      '```animation\nfunction A() { const s = "it\'s {fine}"; }\n```'
    );
    expect(code).toContain("InlineAnimation");
    expect(code).toContain("{fine}");
  });

  it("compiles an <Embed> tag through to the component map", async () => {
    const code = await compileArticle('<Embed slug="anim-orbit" />');
    expect(code).toContain("Embed");
    expect(code).toContain("anim-orbit");
  });

  it("highlights a ```cpp fence without breaking MDX compilation", async () => {
    const code = await compileArticle("```cpp\nint main() { return 0; }\n```");
    expect(code).toContain("shiki");
    expect(code).toContain("--shiki-light");
    expect(code).toContain("--shiki-dark");
  });
});
