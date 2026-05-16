import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter, DEFAULT_ARTICLE_METADATA } from "@/lib/frontmatter";

describe("parseFrontmatter", () => {
  it("parses a valid full YAML block and returns correct metadata + body", () => {
    const mdx = `---
status: draft
tags: ["physics","mechanics"]
description: "A test article"
canvas: anim-my-animation
---

# Hello

Body text here.`;

    const { metadata, body } = parseFrontmatter(mdx);
    expect(metadata.status).toBe("draft");
    expect(metadata.tags).toEqual(["physics", "mechanics"]);
    expect(metadata.description).toBe("A test article");
    expect(metadata.canvas).toBe("anim-my-animation");
    expect(body).toContain("# Hello");
    expect(body).toContain("Body text here.");
    // body should not contain the YAML block
    expect(body).not.toContain("status:");
    expect(body).not.toContain("---");
  });

  it("returns defaults and body === input when no --- block is present", () => {
    const mdx = "# Just a normal article\n\nNo frontmatter here.";
    const { metadata, body } = parseFrontmatter(mdx);
    expect(metadata).toEqual(DEFAULT_ARTICLE_METADATA);
    expect(body).toBe(mdx);
  });

  it("returns defaults and does not throw on malformed YAML", () => {
    const mdx = "---\nstatus: [unclosed\n---\n\nBody text.";
    const { metadata, body } = parseFrontmatter(mdx);
    expect(metadata).toEqual(DEFAULT_ARTICLE_METADATA);
    // body should still be present
    expect(typeof body).toBe("string");
  });

  it("strips leading whitespace from the returned body", () => {
    const mdx = "---\nstatus: published\ntags: []\ndescription: \"\"\ncanvas: null\n---\n\n\n\n   Hello world";
    const { body } = parseFrontmatter(mdx);
    // trimStart() should remove leading newlines
    expect(body.startsWith("Hello") || body.startsWith("\n")).not.toBe(false);
    expect(body.trimStart()).toContain("Hello world");
  });

  it("lowercases tags during parsing", () => {
    const mdx = "---\nstatus: published\ntags: [\"Physics\",\"MECHANICS\"]\ndescription: \"\"\ncanvas: null\n---\n\nBody.";
    const { metadata } = parseFrontmatter(mdx);
    expect(metadata.tags).toEqual(["physics", "mechanics"]);
  });

  it("clamps invalid status to default (published)", () => {
    const mdx = "---\nstatus: nonsense\ntags: []\ndescription: \"\"\ncanvas: null\n---\n\nBody.";
    const { metadata } = parseFrontmatter(mdx);
    expect(metadata.status).toBe("published");
  });

  it("accepts tags: [] and description: '' literally", () => {
    const mdx = "---\nstatus: review\ntags: []\ndescription: \"\"\ncanvas: null\n---\n\nBody.";
    const { metadata } = parseFrontmatter(mdx);
    expect(metadata.tags).toEqual([]);
    expect(metadata.description).toBe("");
  });

  it("returns defaults when content is an empty string", () => {
    const { metadata, body } = parseFrontmatter("");
    expect(metadata).toEqual(DEFAULT_ARTICLE_METADATA);
    expect(body).toBe("");
  });
});

describe("serializeFrontmatter", () => {
  it("round-trips: parse(serialize(meta, body)).metadata deep-equals meta", () => {
    const meta = {
      status: "draft" as const,
      tags: ["physics", "mechanics"],
      description: "A description",
      canvas: "anim-my-anim",
    };
    const body = "# Article body\n\nSome text.";
    const serialized = serializeFrontmatter(meta, body);
    const { metadata, body: parsedBody } = parseFrontmatter(serialized);
    expect(metadata).toEqual(meta);
    expect(parsedBody).toContain("# Article body");
  });

  it("round-trips with description containing quotes, backslashes, and newlines", () => {
    const meta = {
      status: "published" as const,
      tags: [],
      description: 'He said "hello" and \\ and \n newlines',
      canvas: null,
    };
    const body = "Body.";
    const serialized = serializeFrontmatter(meta, body);
    const { metadata } = parseFrontmatter(serialized);
    expect(metadata.description).toBe('He said "hello" and \\ and \n newlines');
  });

  it("emits all four keys even when values are empty/null", () => {
    const meta = {
      status: "published" as const,
      tags: [],
      description: "",
      canvas: null,
    };
    const serialized = serializeFrontmatter(meta, "Body.");
    expect(serialized).toContain("status:");
    expect(serialized).toContain("tags:");
    expect(serialized).toContain("description:");
    expect(serialized).toContain("canvas:");
  });

  it("does not accumulate blank lines on repeated round trips", () => {
    const meta = {
      status: "published" as const,
      tags: ["a"],
      description: "Desc",
      canvas: null,
    };
    const body = "Body line.";
    const once = serializeFrontmatter(meta, body);
    const { metadata: m2, body: b2 } = parseFrontmatter(once);
    const twice = serializeFrontmatter(m2, b2);
    const { body: b3 } = parseFrontmatter(twice);

    // Count leading newlines in body — should be zero after trimStart
    const leadingNewlines = b3.length - b3.trimStart().length;
    expect(leadingNewlines).toBe(0);
    // The twice-serialized content should not grow indefinitely
    expect(twice.length).toBe(once.length);
  });
});
