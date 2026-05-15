import { describe, it, expect } from "vitest";
import { parseArticleSections, reconstructMdx, type Section } from "@/lib/article-sections";

describe("parseArticleSections", () => {
  it("returns one preamble section with empty body for an empty string", () => {
    const result = parseArticleSections("");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("preamble");
    expect(result[0].heading).toBe("");
    expect(result[0].body).toBe("");
  });

  it("returns one preamble section with full content when there are no ## headings", () => {
    const mdx = "Some intro text.\n\nA second paragraph.";
    const result = parseArticleSections(mdx);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("preamble");
    expect(result[0].body).toBe(mdx);
  });

  it("returns preamble + one section for content with one ## heading", () => {
    const mdx = "Intro paragraph.\n\n## My Section\n\nSection body here.";
    const result = parseArticleSections(mdx);
    expect(result).toHaveLength(2);

    expect(result[0].id).toBe("preamble");
    expect(result[0].body).toBe("Intro paragraph.\n");

    expect(result[1].id).toBe("my-section");
    expect(result[1].heading).toBe("My Section");
    expect(result[1].body).toBe("## My Section\n\nSection body here.");
  });

  it("returns 3 sections for content with a preamble and two ## headings", () => {
    const mdx = "Preamble.\n\n## Section One\n\nFirst body.\n\n## Section Two\n\nSecond body.";
    const result = parseArticleSections(mdx);
    expect(result).toHaveLength(3);

    expect(result[0].id).toBe("preamble");
    expect(result[1].heading).toBe("Section One");
    expect(result[1].body).toBe("## Section One\n\nFirst body.\n");
    expect(result[2].heading).toBe("Section Two");
    expect(result[2].body).toBe("## Section Two\n\nSecond body.");
  });

  it("gives preamble an empty body when content starts with ##", () => {
    const mdx = "## First Section\n\nBody text.";
    const result = parseArticleSections(mdx);

    expect(result[0].id).toBe("preamble");
    expect(result[0].body).toBe("");

    expect(result[1].id).toBe("first-section");
    expect(result[1].heading).toBe("First Section");
    expect(result[1].body).toBe("## First Section\n\nBody text.");
  });

  it("deduplicates ids when two headings slugify to the same value", () => {
    const mdx = "## Newton\n\nFirst.\n\n## Newton\n\nSecond.";
    const result = parseArticleSections(mdx);
    expect(result).toHaveLength(3);
    expect(result[1].id).toBe("newton");
    expect(result[2].id).toBe("newton-2");
  });

  it("correctly slugifies a heading with special characters", () => {
    const mdx = "##  Newton's Laws!\n\nBody.";
    const result = parseArticleSections(mdx);
    // The heading text after "## " is " Newton's Laws!"
    // Slugified: lowercase, non-alnum → "-", trim leading/trailing "-"
    expect(result[1].id).toBe("newton-s-laws");
  });
});

describe("reconstructMdx", () => {
  it("joins sections correctly with no preamble (empty string)", () => {
    const sectionA: Section = { id: "alpha", heading: "Alpha", body: "## Alpha\n\nContent A." };
    const sectionB: Section = { id: "beta", heading: "Beta", body: "## Beta\n\nContent B." };
    const result = reconstructMdx("", [sectionA, sectionB]);
    expect(result).toBe("## Alpha\n\nContent A.\n## Beta\n\nContent B.\n");
  });

  it("prepends preamble with a newline separator before sections", () => {
    const sectionA: Section = { id: "alpha", heading: "Alpha", body: "## Alpha\n\nContent." };
    const result = reconstructMdx("preamble text", [sectionA]);
    expect(result).toBe("preamble text\n## Alpha\n\nContent.\n");
  });

  it("always ends with exactly one trailing newline", () => {
    const section: Section = { id: "s", heading: "S", body: "## S\n\nBody." };
    const result = reconstructMdx("preamble", [section]);
    expect(result.endsWith("\n")).toBe(true);
    expect(result.endsWith("\n\n")).toBe(false);
  });

  it("round-trips through parseArticleSections for a multi-section article", () => {
    const original = "Intro text.\n\n## Section One\n\nFirst paragraph.\n\n## Section Two\n\nSecond paragraph.";
    const parsed = parseArticleSections(original);
    const preamble = parsed[0];
    const sections = parsed.slice(1);
    const reconstructed = reconstructMdx(preamble.body, sections);
    expect(reconstructed).toBe(original.trimEnd() + "\n");
  });
});
