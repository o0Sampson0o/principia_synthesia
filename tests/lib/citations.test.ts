import { describe, it, expect } from "vitest";
import { formatAPA, formatMLA, formatChicago, formatBibTeX, type CitationInput } from "@/lib/citations";

const base: CitationInput = {
  authorDisplayName: "Alice Smith",
  authorPublisherSlug: "alice",
  title: "Introduction to Topology",
  publishedAt: new Date("2025-03-15T00:00:00.000Z"),
  url: "https://principia-synthesia.com/alice/articles/article-intro-topology",
  versionHash: null,
  accessedAt: new Date("2026-05-24T00:00:00.000Z"),
};

const versioned: CitationInput = {
  ...base,
  url: "https://principia-synthesia.com/alice/articles/article-intro-topology?v=abc1234",
  versionHash: "abc1234",
};

describe("formatAPA", () => {
  it("renders correct APA without version", () => {
    const result = formatAPA(base);
    expect(result).toContain("Alice Smith.");
    expect(result).toContain("(2025).");
    expect(result).toContain("Introduction to Topology.");
    expect(result).toContain("Principia Synthesia.");
    expect(result).toContain("accessed 2026-05-24");
    expect(result).not.toContain("version");
  });

  it("includes version hash when present", () => {
    const result = formatAPA(versioned);
    expect(result).toContain("version abc1234");
    expect(result).toContain("accessed 2026-05-24");
  });
});

describe("formatMLA", () => {
  it("renders correct MLA without version", () => {
    const result = formatMLA(base);
    expect(result).toContain("Alice Smith.");
    expect(result).toContain('"Introduction to Topology."');
    expect(result).toContain("*Principia Synthesia*");
    expect(result).toContain("15 Mar 2025");
    expect(result).toContain("Accessed 24 May 2026.");
  });
});

describe("formatChicago", () => {
  it("renders correct Chicago format", () => {
    const result = formatChicago(base);
    expect(result).toContain("Alice Smith.");
    expect(result).toContain('"Introduction to Topology."');
    expect(result).toContain("Principia Synthesia.");
    expect(result).toContain("Modified March 15, 2025");
  });
});

describe("formatBibTeX", () => {
  it("renders correct BibTeX without version", () => {
    const result = formatBibTeX(base);
    expect(result).toContain("@misc{");
    expect(result).toContain("smith");      // author last name slug
    expect(result).toContain("intro");      // first slug word
    expect(result).toContain("2025");
    expect(result).toContain("author    = {Alice Smith}");
    expect(result).toContain("title     = {{Introduction to Topology}}");
    expect(result).not.toContain("version");
  });

  it("includes version field when present", () => {
    const result = formatBibTeX(versioned);
    expect(result).toContain("version   = {abc1234}");
  });
});
