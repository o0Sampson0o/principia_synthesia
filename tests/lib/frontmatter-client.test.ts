// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseFrontmatterClient,
  serializeFrontmatterBlock,
  assembleContent,
} from "@/lib/frontmatter-client";
import { parseFrontmatter } from "@/lib/frontmatter";
import type { ArticleMetadata } from "@/lib/validations";

const META: ArticleMetadata = {
  status: "draft",
  tags: ["physics", "logic"],
  description: 'A "quoted" summary',
  canvas: "anim-pendulum",
};

describe("frontmatter-client", () => {
  it("round-trips metadata + body through parse ∘ assemble", () => {
    const body = "# Heading\n\nSome body text.";
    const full = assembleContent(META, body);
    const parsed = parseFrontmatterClient(full);
    expect(parsed.metadata).toEqual(META);
    expect(parsed.body).toBe(body);
  });

  it("client-assembled content re-parses to the same metadata via the SERVER parser", () => {
    // This is the load-bearing guarantee: what the editor stores must fill the
    // articles.metadata column correctly (server parseFrontmatter uses gray-matter).
    const body = "Body.";
    const full = assembleContent(META, body);
    const server = parseFrontmatter(full);
    expect(server.metadata.status).toBe("draft");
    expect(server.metadata.tags).toEqual(["physics", "logic"]);
    expect(server.metadata.description).toBe('A "quoted" summary');
    expect(server.metadata.canvas).toBe("anim-pendulum");
    expect(server.body).toBe(body);
  });

  it("handles canvas: null and an empty body", () => {
    const meta: ArticleMetadata = { status: "published", tags: [], description: "", canvas: null };
    const full = assembleContent(meta, "");
    expect(full).toContain("canvas: null");
    expect(parseFrontmatterClient(full).metadata).toEqual(meta);
    // Server agrees canvas is null.
    expect(parseFrontmatter(full).metadata.canvas).toBeNull();
  });

  it("serializes the four canonical fields in order", () => {
    const block = serializeFrontmatterBlock({
      status: "review",
      tags: ["a"],
      description: "d",
      canvas: null,
    });
    expect(block).toBe('---\nstatus: review\ntags: ["a"]\ndescription: "d"\ncanvas: null\n---');
  });

  it("returns the input as body when there is no frontmatter block", () => {
    const { metadata, body } = parseFrontmatterClient("just body, no fm");
    expect(body).toBe("just body, no fm");
    expect(metadata.status).toBe("published"); // defaults
  });
});
