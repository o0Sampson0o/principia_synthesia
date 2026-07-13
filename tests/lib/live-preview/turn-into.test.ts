// @vitest-environment node
import { describe, it, expect } from "vitest";
import { splitBlockPrefix, convertLine } from "@/lib/live-preview/turn-into";

describe("splitBlockPrefix", () => {
  it.each([
    ["# Heading", "", "# ", "Heading"],
    ["### Deep", "", "### ", "Deep"],
    ["- bullet", "", "- ", "bullet"],
    ["1. numbered", "", "1. ", "numbered"],
    ["- [ ] todo", "", "- [ ] ", "todo"],
    ["> quote", "", "> ", "quote"],
    ["> [!note] callout", "", "> [!note] ", "callout"],
    ["plain text", "", "", "plain text"],
    ["  - indented", "  ", "- ", "indented"],
  ])("%s → content %q", (line, indent, prefix, content) => {
    const r = splitBlockPrefix(line);
    expect(r.indent).toBe(indent);
    expect(r.prefix).toBe(prefix);
    expect(r.content).toBe(content);
  });
});

describe("convertLine", () => {
  it("converts between block types, keeping the content", () => {
    expect(convertLine("# Title", "paragraph")).toBe("Title");
    expect(convertLine("Title", "h2")).toBe("## Title");
    expect(convertLine("- bullet", "todo")).toBe("- [ ] bullet");
    expect(convertLine("1. item", "quote")).toBe("> item");
    expect(convertLine("> quote", "h1")).toBe("# quote");
    expect(convertLine("> [!note] x", "bullet")).toBe("- x");
  });

  it("preserves indentation", () => {
    expect(convertLine("  plain", "bullet")).toBe("  - plain");
    expect(convertLine("  - a", "paragraph")).toBe("  a");
  });

  it("is idempotent for the same target", () => {
    expect(convertLine("## H", "h2")).toBe("## H");
  });
});
