// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { compile, evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { buildArticleMdxOptions } from "@/lib/article-mdx";
import { parseStyleString } from "@/lib/rehype-jsx-style-objects";

const options = () => buildArticleMdxOptions({ slugToNumber: new Map(), resolved: new Map() });

/** Compile exactly as the published page does. */
async function compileArticle(source: string): Promise<string> {
  const file = await compile(source, { ...options().mdxOptions, outputFormat: "function-body" });
  return String(file);
}

/**
 * Render the compiled MDX through React, which is the only way this class of
 * bug shows up: a string `style` compiles fine and only throws when React
 * actually commits it to the DOM.
 *
 * `react-dom/server` is banned in the App Router (see lib/preview-mdx-render.ts)
 * but is exactly the right tool in a test — it is what proves the published
 * page will not throw.
 */
async function renderArticle(source: string): Promise<string> {
  const mod = await evaluate(source, { ...options().mdxOptions, ...runtime });
  return renderToStaticMarkup(React.createElement(mod.default));
}

/**
 * The published page does not call `@mdx-js/mdx` directly — it goes through
 * `next-mdx-remote`, which appends its own `removeJavaScriptExpressions` remark
 * plugin. That plugin deletes JSX attribute expressions, so a style object
 * built during the *remark* phase compiles fine in isolation and is silently
 * stripped here. Only this path catches that.
 */
describe("through next-mdx-remote's serialize (the published path)", () => {
  it("survives the JSX-expression stripper", async () => {
    const { serialize } = await import("next-mdx-remote/serialize");
    const result = await serialize('<span style="color: red">x</span>', options(), true);
    expect(result.compiledSource).toContain('"color"');
    expect(result.compiledSource).toContain('"red"');
  });

  it("still strips an expression the author wrote themselves", async () => {
    const { serialize } = await import("next-mdx-remote/serialize");
    const result = await serialize("<span title={globalThis.secret}>x</span>", options(), true);
    expect(result.compiledSource).not.toContain("globalThis");
  });
});

describe("rehypeJsxStyleObjects", () => {
  it("renders a string style attribute instead of throwing React error #62", async () => {
    const html = await renderArticle('Bits: <span style="color: red">01000001</span>');
    expect(html).toContain("01000001");
    expect(html).toMatch(/style="color:\s*red"/);
  });

  it("is what makes it renderable — the raw string throws without the plugin", async () => {
    // Same source, no plugins: proves the failure is real and this fixes it.
    const mod = await evaluate('<span style="color: red">x</span>', { ...runtime });
    expect(() => renderToStaticMarkup(React.createElement(mod.default))).toThrow(
      /style. prop expects a mapping/i
    );
  });

  it("camel-cases hyphenated properties for React", async () => {
    const html = await renderArticle('<span style="background-color: #eee; font-weight: bold">x</span>');
    expect(html).toMatch(/background-color:\s*#eee/);
    expect(html).toMatch(/font-weight:\s*bold/);
  });

  it("leaves an already-expression style untouched", async () => {
    const html = await renderArticle('<span style={{ color: "blue" }}>x</span>');
    expect(html).toMatch(/style="color:\s*blue"/);
  });

  it("compiles a style on a block-level element", async () => {
    const code = await compileArticle('<div style="margin-top: 1rem">\n\nhi\n\n</div>');
    expect(code).toContain("marginTop");
  });

  it("drops an empty style rather than handing React a string", async () => {
    const html = await renderArticle('<span style="">x</span>');
    expect(html).not.toContain("style=");
    expect(html).toContain("x");
  });
});

describe("parseStyleString", () => {
  it("splits declarations and camel-cases properties", () => {
    expect(parseStyleString("color: red; background-color: blue")).toEqual([
      ["color", "red"],
      ["backgroundColor", "blue"],
    ]);
  });

  it("keeps CSS custom properties verbatim", () => {
    expect(parseStyleString("--brand-hue: 210")).toEqual([["--brand-hue", "210"]]);
  });

  it("does not split inside url(...) on its colon or semicolon", () => {
    expect(parseStyleString("background: url(data:image/png;base64,AAA); color: red")).toEqual([
      ["background", "url(data:image/png;base64,AAA)"],
      ["color", "red"],
    ]);
  });

  it("tolerates a trailing semicolon and stray whitespace", () => {
    expect(parseStyleString("  color : red ;  ")).toEqual([["color", "red"]]);
  });

  it("ignores a declaration with no value", () => {
    expect(parseStyleString("color; font-weight: bold")).toEqual([["fontWeight", "bold"]]);
  });
});
