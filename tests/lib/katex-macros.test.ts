// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { serialize } from "next-mdx-remote/serialize";
import katex from "katex";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { buildArticleMdxOptions } from "@/lib/article-mdx";
import { buildKatexMacros, extractMacroSource } from "@/lib/katex-macros";

const fence = (body: string) => "```katex\n" + body + "\n```";

/** Compile through the published path, with macros collected from the source. */
async function render(source: string, bookMacros?: string): Promise<string> {
  const macros = buildKatexMacros(bookMacros, extractMacroSource(source));
  const result = await serialize(source, buildArticleMdxOptions({ slugToNumber: new Map(), resolved: new Map() }, macros), true);
  return result.compiledSource;
}

/** KaTeX emits `frac-line` only when \frac actually expanded. */
const expanded = (compiled: string) => compiled.includes("frac-line");

describe("extractMacroSource", () => {
  it("collects a ```katex block", () => {
    expect(extractMacroSource(`# T\n\n${fence("\\gdef\\a{1}")}\n\ntext`)).toBe("\\gdef\\a{1}");
  });

  it("collects several blocks in order", () => {
    const body = `${fence("\\gdef\\a{1}")}\n\ntext\n\n${fence("\\gdef\\b{2}")}`;
    expect(extractMacroSource(body)).toBe("\\gdef\\a{1}\n\\gdef\\b{2}");
  });

  it("ignores other fence languages", () => {
    expect(extractMacroSource("```js\n\\gdef\\a{1}\n```")).toBe("");
  });

  it("ignores a katex fence nested inside a longer fence", () => {
    // A tutorial showing the syntax must not silently define macros.
    const body = "````md\n```katex\n\\gdef\\a{1}\n```\n````";
    expect(extractMacroSource(body)).toBe("");
  });

  it("handles an unclosed fence at end of document", () => {
    expect(extractMacroSource("```katex\n\\gdef\\a{1}")).toBe("\\gdef\\a{1}");
  });
});

describe("buildKatexMacros", () => {
  it("accepts \\gdef, \\newcommand and \\def alike", () => {
    // Only \gdef survives a plain KaTeX render; the others need globalGroup,
    // which is exactly what this helper turns on. Authors should not have to
    // know which spelling is which.
    const macros = buildKatexMacros(
      "\\gdef\\a{\\frac1 2}\n\\newcommand{\\b}{\\frac1 2}\n\\def\\c{\\frac1 2}"
    );
    expect(Object.keys(macros).sort()).toEqual(["\\a", "\\b", "\\c"]);
  });

  it("supports parameterised macros", () => {
    const macros = buildKatexMacros("\\newcommand{\\deriv}[1]{\\frac{d#1}{dt}}");
    expect(macros).toHaveProperty("\\deriv");
  });

  it("lets a later source define over an earlier one", () => {
    // Asserted on the rendered result, not the table: KaTeX stores macros as
    // token objects, so the stored value is not the source text.
    const both = buildKatexMacros("\\gdef\\x{\\alpha}", "\\gdef\\x{\\beta}");
    expect(katex.renderToString("\\x", { macros: both })).toContain("β");
  });

  it("does not throw on malformed definitions", () => {
    expect(() => buildKatexMacros("\\gdef\\broken{{{")).not.toThrow();
  });

  it("returns an empty object for empty input", () => {
    expect(buildKatexMacros(null, undefined, "  ")).toEqual({});
  });
});

describe("macros end to end (published pipeline)", () => {
  it("expands a macro defined in the article", async () => {
    expect(expanded(await render(`${fence("\\gdef\\dd{\\frac{d}{dt}}")}\n\n$$\\dd x$$`))).toBe(true);
  });

  it("expands a macro used *above* where it is defined", async () => {
    // The block is collected from the source before parsing, so order is free.
    expect(expanded(await render(`$$\\dd x$$\n\n${fence("\\gdef\\dd{\\frac{d}{dt}}")}`))).toBe(true);
  });

  it("expands a \\newcommand written in the fence", async () => {
    expect(expanded(await render(`${fence("\\newcommand{\\dd}{\\frac{d}{dt}}")}\n\n$$\\dd x$$`))).toBe(true);
  });

  it("expands a parameterised macro", async () => {
    const out = await render(`${fence("\\newcommand{\\deriv}[1]{\\frac{d#1}{dt}}")}\n\n$$\\deriv{x}$$`);
    expect(expanded(out)).toBe(true);
  });

  it("expands a book macro when one is supplied", async () => {
    expect(expanded(await render("$$\\dd x$$", "\\gdef\\dd{\\frac{d}{dt}}"))).toBe(true);
  });

  it("lets the article shadow a book macro of the same name", async () => {
    const out = await render(`${fence("\\gdef\\dd{\\sqrt{2}}")}\n\n$$\\dd$$`, "\\gdef\\dd{\\frac{d}{dt}}");
    expect(out).toContain("sqrt");
    expect(expanded(out)).toBe(false);
  });

  it("renders nothing for the fence itself", async () => {
    const out = await render(`${fence("\\gdef\\dd{\\frac{d}{dt}}")}\n\ntext`);
    // No code listing, and the definition text is not printed as prose.
    expect(out).not.toContain("language-katex");
    expect(out).not.toContain("gdef");
  });

  it("leaves an undefined macro alone rather than failing the page", async () => {
    const out = await render("$$\\undefinedmacro x$$");
    expect(out).toContain("katex");
  });
});
