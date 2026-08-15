// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * These tests lock in the whole point of `lib/article-mdx.tsx`: the editor
 * Preview now renders through the SAME MDX engine + plugins + components as the
 * published page, so the cases that used to diverge (markdown swallowed under
 * an HTML block, `<Cite>`/wikilinks, leaked frontmatter) render correctly.
 *
 * `@/db` is mocked so `resolveCitations` never opens a real connection. The
 * pure-markdown cases contain no `<Cite>` and so never query it at all.
 */
const mockSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: { select: mockSelect },
}));

import { renderPreviewHtml } from "@/lib/preview-mdx-render";

const PUB = { publisherSlug: "alice" };

/** Make `db.select(...).from(...).where(...)` resolve to the given rows. */
function stubDb(rows: unknown[] = []) {
  const chain = { from: () => chain, where: () => Promise.resolve(rows) };
  mockSelect.mockReturnValue(chain);
}

describe("renderPreviewHtml (MDX-parsed preview == published)", () => {
  it("keeps <summary> first and parses a flush markdown list inside <details>", async () => {
    const source = `<details>
<summary>Other theories</summary>
The list goes on.
- Simulation Theory
- Brain in a vat
</details>`;
    const html = await renderPreviewHtml(source, PUB);

    // <summary> is the first child of <details> (not wrapped in a stray <p>).
    expect(html).toMatch(/<details[^>]*><summary/);
    expect(html).toContain("<summary>Other theories</summary>");
    // The dashed lines became a real list, not literal "- " text.
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Simulation Theory</li>");
    expect(html).not.toContain("- Simulation Theory");
  });

  it("renders math sitting directly under an HTML block (was swallowed in CommonMark)", async () => {
    const source = `<div>box</div>
$E = mc^2$`;
    const html = await renderPreviewHtml(source, PUB);
    expect(html).toContain("katex");
    expect(html).not.toContain("$E = mc^2$");
  });

  it("renders a list sitting directly under an HTML block", async () => {
    const source = `<div>box</div>
- first
- second`;
    const html = await renderPreviewHtml(source, PUB);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>first</li>");
  });

  it("renders a callout via remarkCallouts", async () => {
    const html = await renderPreviewHtml("> [!note] Heads up\n> Body text.", PUB);
    expect(html).toContain("callout callout-note");
    expect(html).toContain('data-callout="note"');
  });

  it("renders a wikilink as a real link", async () => {
    const html = await renderPreviewHtml("See [[alice:articles:article-intro|My Article]].", PUB);
    expect(html).toContain('href="/alice/articles/article-intro"');
    expect(html).toContain("My Article");
    expect(html).not.toContain("[[alice");
  });

  it("substitutes <Cite> as a component (unresolved → [?]), not raw text", async () => {
    stubDb([]); // no matching publisher/article rows → citation stays unresolved
    const html = await renderPreviewHtml('A claim.<Cite slug="alice/some-article" />', PUB);
    expect(html).toContain("[?]");
    expect(html).toContain("Cited article not found");
    expect(html).not.toContain("<Cite");
  });

  it("highlights a ```cpp fence with both colour schemes baked in", async () => {
    const html = await renderPreviewHtml("```cpp\nint main() { return 0; }\n```", PUB);
    expect(html).toContain("shiki");
    // Tokens carry a colour per scheme; app/globals.css picks which one applies.
    expect(html).toMatch(/--shiki-light:#[0-9A-Fa-f]{6}/);
    expect(html).toMatch(/--shiki-dark:#[0-9A-Fa-f]{6}/);
    // `int` is a keyword, so it must not share the plain-text colour.
    expect(html).toContain("int");
  });

  it("falls back to plain text for a language that does not exist", async () => {
    const html = await renderPreviewHtml("```notalanguage\nhello\n```", PUB);
    expect(html).toContain("hello");
    expect(html).toContain("<pre");
  });

  it("leaves a mount point for a ```mermaid fence instead of a code listing", async () => {
    const html = await renderPreviewHtml("```mermaid\ngraph TD;\n  A-->B;\n```", PUB);
    expect(html).toContain('data-ps-embed="mermaid"');
    expect(html).toContain('data-ps-source="graph TD;\n  A-->B;"');
    expect(html).not.toContain("<pre");
  });

  it("leaves a mount point for a ```animation fence", async () => {
    const html = await renderPreviewHtml("```animation height=520\nfunction Wave() {}\n```", PUB);
    expect(html).toContain('data-ps-embed="inline-animation"');
    expect(html).toContain('data-ps-height="520"');
    expect(html).toContain("function Wave() {}");
    expect(html).not.toContain("<pre");
  });

  it("passes an <Embed> target through untouched, with the article's publisher as the default", async () => {
    const html = await renderPreviewHtml('<Embed slug="anim-orbit" />', PUB);
    expect(html).toContain('data-ps-embed="embed"');
    expect(html).toContain('data-ps-slug="anim-orbit"');
    expect(html).toContain('data-ps-default-publisher="alice"');
  });

  it("does not parse a wikilink-addressed <Embed> target itself", async () => {
    const html = await renderPreviewHtml('<Embed slug="bob:objects:anim-orbit" />', PUB);
    expect(html).toContain('data-ps-slug="bob:objects:anim-orbit"');
    expect(html).toContain('data-ps-default-publisher="alice"');
  });

  it("carries an explicit publisher prop alongside the default", async () => {
    const html = await renderPreviewHtml('<Embed slug="anim-orbit" publisher="bob" />', PUB);
    expect(html).toContain('data-ps-publisher="bob"');
    expect(html).toContain('data-ps-default-publisher="alice"');
  });

  it("strips the YAML frontmatter block from the rendered output", async () => {
    const source = `---
status: draft
tags: ["physics"]
---

Hello world.`;
    const html = await renderPreviewHtml(source, PUB);
    expect(html).toContain("Hello world.");
    expect(html).not.toContain("status:");
    expect(html).not.toContain("physics");
  });
});
