import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { normalizeDetailsBlocks } from "@/lib/normalize-details";

/** The remark→rehype pipeline used by the editor preview / EPUB / PDF. */
async function toHtml(src: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(normalizeDetailsBlocks(src));
  return String(file);
}

function parse(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const SOURCE = `<details>
<summary>Other theories</summary>
The list goes on, but a few more are worth mentioning.
- Simulation Theory: We are living in a simulation
- Introspective Solipsism: brain in a vat

Specifically to pop-science
- The Everett Many-Worlds Interpretation: every quantum outcome
</details>`;

describe("normalizeDetailsBlocks", () => {
  it("renders <summary> and markdown lists correctly through remark", async () => {
    const el = parse(await toHtml(SOURCE));
    const details = el.querySelector("details");
    expect(details).not.toBeNull();

    // <summary> must be the disclosure label — the first element child.
    const firstChild = details!.firstElementChild;
    expect(firstChild?.tagName.toLowerCase()).toBe("summary");
    expect(firstChild?.textContent).toBe("Other theories");

    // Both list runs render as real <ul>, not literal dash text.
    const lists = details!.querySelectorAll("ul");
    expect(lists.length).toBe(2);
    expect(details!.querySelectorAll("li").length).toBe(3);
    // No stray literal "- " markers survived as text.
    expect(details!.textContent).not.toContain("- Simulation");
  });

  it("is a no-op when there is no <details> block", () => {
    const src = "Just a paragraph\n- a\n- b\n";
    expect(normalizeDetailsBlocks(src)).toBe(src);
  });

  it("leaves <details> inside a fenced code block untouched", () => {
    const src = "```html\n<details>\n<summary>x</summary>\ntext\n</details>\n```";
    expect(normalizeDetailsBlocks(src)).toBe(src);
  });

  it("does not add duplicate blank lines when already spaced", () => {
    const src = "<details>\n\n<summary>t</summary>\n\nbody\n\n</details>";
    expect(normalizeDetailsBlocks(src)).toBe(src);
  });

  it("handles <details open> with attributes", () => {
    const out = normalizeDetailsBlocks("<details open>\n<summary>t</summary>\nbody\n</details>");
    expect(out).toContain("<details open>\n\n<summary>t</summary>\n\nbody\n\n</details>");
  });
});
