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
