// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  injectPsId,
  stripPsId,
  readPsId,
  semanticHash,
  validateFrontmatter,
  deriveTitle,
  slugFromFilename,
  normalizeCanonicalMetadata,
} from "../../cli/ps-sync/src/content";

const SERVER_STYLE = `---
status: published
tags: ["mechanics","classical-physics"]
description: "Newton's three laws"
canvas: null
---

# Newton's Laws

Some body text with $$ math $$ and [[pub:articles:article-other|a link]].
`;

// The same document after Obsidian's Properties editor rewrites the YAML
// (block-style arrays, unquoted strings, reordered keys).
const OBSIDIAN_STYLE = `---
tags:
  - mechanics
  - classical-physics
status: published
description: Newton's three laws
canvas: null
---

# Newton's Laws

Some body text with $$ math $$ and [[pub:articles:article-other|a link]].
`;

describe("ps-id inject/strip", () => {
  it("injects into an existing frontmatter block and strips back losslessly", () => {
    const injected = injectPsId(SERVER_STYLE, 42);
    expect(injected).toContain("ps-id: 42");
    expect(readPsId(injected)).toBe(42);

    const { content, psId } = stripPsId(injected);
    expect(psId).toBe(42);
    expect(content).toBe(SERVER_STYLE);
  });

  it("creates a frontmatter block when the content has none", () => {
    const bare = "# Just a heading\n\nBody.\n";
    const injected = injectPsId(bare, 7);
    expect(injected.startsWith("---\nps-id: 7\n---\n")).toBe(true);

    const { content, psId } = stripPsId(injected);
    expect(psId).toBe(7);
    expect(content).toBe(bare);
  });

  it("replaces an existing ps-id instead of duplicating", () => {
    const once = injectPsId(SERVER_STYLE, 1);
    const twice = injectPsId(once, 2);
    expect(twice.match(/ps-id:/g)).toHaveLength(1);
    expect(readPsId(twice)).toBe(2);
  });

  it("preserves other frontmatter keys byte-for-byte when stripping", () => {
    const withCustom = `---
status: draft
tags: []
description: ""
canvas: null
aliases: [Newton]
cssclasses:
  - wide
---

Body.
`;
    const injected = injectPsId(withCustom, 9);
    expect(stripPsId(injected).content).toBe(withCustom);
  });

  it("returns content unchanged when there is no ps-id", () => {
    const { content, psId } = stripPsId(SERVER_STYLE);
    expect(psId).toBeNull();
    expect(content).toBe(SERVER_STYLE);
  });
});

describe("semanticHash", () => {
  it("is identical across the server style and Obsidian's YAML rewrite", () => {
    expect(semanticHash(SERVER_STYLE)).toBe(semanticHash(OBSIDIAN_STYLE));
  });

  it("changes when a tag changes", () => {
    const edited = OBSIDIAN_STYLE.replace("- mechanics", "- quantum");
    expect(semanticHash(edited)).not.toBe(semanticHash(SERVER_STYLE));
  });

  it("changes when the body changes", () => {
    const edited = SERVER_STYLE.replace("Some body text", "Different body text");
    expect(semanticHash(edited)).not.toBe(semanticHash(SERVER_STYLE));
  });

  it("changes when a custom (non-canonical) key is added or edited", () => {
    const withKey = SERVER_STYLE.replace("---\n\n#", '---\ncustom: "x"\n---\n\n#');
    // rebuild properly: add key inside the block instead
    const added = SERVER_STYLE.replace("canvas: null", 'canvas: null\ncustom: "x"');
    expect(semanticHash(added)).not.toBe(semanticHash(SERVER_STYLE));
    expect(withKey).toBeTruthy(); // silence unused
  });

  it("ignores trailing whitespace differences in the body", () => {
    expect(semanticHash(SERVER_STYLE + "\n\n")).toBe(semanticHash(SERVER_STYLE));
  });
});

describe("normalizeCanonicalMetadata / validateFrontmatter", () => {
  it("applies defaults for missing fields", () => {
    expect(normalizeCanonicalMetadata({})).toEqual({
      status: "published",
      tags: [],
      description: "",
      canvas: null,
    });
  });

  it("lowercases and trims tags", () => {
    expect(normalizeCanonicalMetadata({ tags: [" Mechanics "] })?.tags).toEqual(["mechanics"]);
  });

  it("rejects invalid status / tags / canvas", () => {
    expect(normalizeCanonicalMetadata({ status: "nope" })).toBeNull();
    expect(normalizeCanonicalMetadata({ tags: "not-an-array" })).toBeNull();
    expect(normalizeCanonicalMetadata({ canvas: "not-an-anim" })).toBeNull();
  });

  it("flags frontmatter the server would reset to defaults", () => {
    const bad = SERVER_STYLE.replace("status: published", "status: banana");
    expect(validateFrontmatter(bad).valid).toBe(false);
    expect(validateFrontmatter(SERVER_STYLE).valid).toBe(true);
    expect(validateFrontmatter("no frontmatter at all").valid).toBe(true);
  });
});

describe("new-article helpers", () => {
  it("derives the title from the first heading, skipping frontmatter", () => {
    expect(deriveTitle(SERVER_STYLE, "file.md")).toBe("Newton's Laws");
    expect(deriveTitle("no heading here", "My Note.md")).toBe("My Note");
  });

  it("derives article-* slugs from filenames", () => {
    expect(slugFromFilename("My Great Note.md")).toBe("article-my-great-note");
    expect(slugFromFilename("article-already-good.md")).toBe("article-already-good");
    expect(() => slugFromFilename("---.md")).toThrow();
  });
});
