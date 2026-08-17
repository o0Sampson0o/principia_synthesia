// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { serialize } from "next-mdx-remote/serialize";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { normalizeCalloutContainers } from "@/lib/normalize-callouts";
import { buildArticleMdxOptions, prepareArticleBody } from "@/lib/article-mdx";

const lines = (...l: string[]) => l.join("\n");

/** Compile the way the published page does, through prepareArticleBody. */
async function render(body: string): Promise<string> {
  const { renderedBody } = prepareArticleBody(body, { publisherSlug: "p" });
  const result = await serialize(
    renderedBody,
    buildArticleMdxOptions({ slugToNumber: new Map(), resolved: new Map() }),
    true
  );
  return result.compiledSource;
}

/**
 * Real HTML, for the assertions that are about *nesting*. The compiled module
 * orders its references however the compiler likes, so "appears earlier in the
 * source" says nothing about what contains what.
 */
async function renderHtml(body: string): Promise<string> {
  const { renderedBody } = prepareArticleBody(body, { publisherSlug: "p" });
  const mod = await evaluate(renderedBody, {
    ...buildArticleMdxOptions({ slugToNumber: new Map(), resolved: new Map() }).mdxOptions,
    ...runtime,
  });
  return renderToStaticMarkup(React.createElement(mod.default as never));
}

describe("normalizeCalloutContainers", () => {
  it("rewrites a container into the blockquote form", () => {
    expect(normalizeCalloutContainers(lines(":::note Title", "Body.", ":::"))).toBe(
      lines("> [!note] Title", "> Body.", "")
    );
  });

  it("keeps the line count identical to the source", () => {
    const src = lines("a", ":::tip", "b", "", "c", ":::", "d");
    expect(normalizeCalloutContainers(src).split("\n")).toHaveLength(src.split("\n").length);
  });

  it("prefixes blank lines so the quote does not end early", () => {
    expect(normalizeCalloutContainers(lines(":::note", "a", "", "b", ":::"))).toBe(
      lines("> [!note]", "> a", ">", "> b", "")
    );
  });

  it("carries the foldable marker and title through", () => {
    expect(normalizeCalloutContainers(lines(":::warning- Careful", "x", ":::"))).toBe(
      lines("> [!warning]- Careful", "> x", "")
    );
  });

  it("handles a container with no title", () => {
    expect(normalizeCalloutContainers(lines(":::tip", "x", ":::"))).toBe(
      lines("> [!tip]", "> x", "")
    );
  });

  it("nests containers as nested quotes", () => {
    expect(normalizeCalloutContainers(lines(":::note Outer", "a", ":::tip Inner", "b", ":::", ":::"))).toBe(
      lines("> [!note] Outer", "> a", "> > [!tip] Inner", "> > b", "", "")
    );
  });

  it("leaves ::: inside a fenced code block alone", () => {
    const src = lines("```md", ":::note", "x", ":::", "```");
    expect(normalizeCalloutContainers(src)).toBe(src);
  });

  it("still prefixes a fenced block that sits inside a container", () => {
    expect(normalizeCalloutContainers(lines(":::note", "```cpp", "int x;", "```", ":::"))).toBe(
      lines("> [!note]", "> ```cpp", "> int x;", "> ```", "")
    );
  });

  it("treats end of document as closing an unclosed container", () => {
    expect(normalizeCalloutContainers(lines(":::note", "x"))).toBe(lines("> [!note]", "> x"));
  });

  it("ignores a bare ::: with no container open", () => {
    expect(normalizeCalloutContainers(lines("a", ":::", "b"))).toBe(lines("a", ":::", "b"));
  });

  it("is a no-op on source with no ':::'", () => {
    const src = lines("# T", "> [!note] Old style", "> body");
    expect(normalizeCalloutContainers(src)).toBe(src);
  });
});

describe("callout containers end to end", () => {
  it("puts a table, display math and code *inside* the callout", async () => {
    // The whole point: none of these survive lazy continuation, so before this
    // transform an author had to prefix every line by hand.
    const html = await renderHtml(
      lines(
        ":::warning Overflow",
        "| bits | max |",
        "| ---- | --- |",
        "| 8    | 255 |",
        "",
        "$$",
        "2^n - 1",
        "$$",
        "",
        "```cpp",
        "int x = 1;",
        "```",
        ":::"
      )
    );
    // The table, the math and the code must all sit *inside* the callout
    // element, not as siblings after it.
    const box = /<(blockquote|div|details)[^>]*callout[^>]*>([\s\S]*?)<\/\1>/.exec(html);
    expect(box).not.toBeNull();
    const inside = box![2];
    expect(inside).toContain("<table");
    expect(inside).toContain("katex");
    expect(inside).toContain("255");
    // The listing is syntax-highlighted, so its text is split across spans —
    // assert on the block, not on contiguous source text.
    expect(inside).toContain("<pre");
    expect(inside).toContain("shiki");
  });

  it("still renders the blockquote spelling", async () => {
    const out = await render(lines("> [!note] Title", "> Body."));
    expect(out).toContain("callout");
    expect(out).toContain("Title");
  });

  it("renders a foldable container as a details disclosure", async () => {
    const html = await renderHtml(lines(":::question- Try it", "Body.", ":::"));
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Try it");
  });

  it("leaves a ::: example inside a code fence as literal text", async () => {
    const out = await render(lines("```md", ":::note", "x", ":::", "```"));
    expect(out).not.toContain("callout");
    expect(out).toContain(":::note");
  });
});
