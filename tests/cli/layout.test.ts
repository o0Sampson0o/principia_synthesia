// @vitest-environment node
import { describe, it, expect } from "vitest";
import { articlePath, bookNotePath, bookFromPath } from "../../cli/ps-sync/src/layout";
import { articleKey } from "../../cli/ps-sync/src/state";

describe("articlePath", () => {
  it("puts a standalone article under <publisher>/articles/", () => {
    expect(articlePath("alice", { slug: "intro", parentBookSlug: null }, "md")).toBe(
      "alice/articles/intro.md"
    );
  });

  it("nests a book section under its book folder", () => {
    expect(articlePath("alice", { slug: "intro", parentBookSlug: "relativity" }, "md")).toBe(
      "alice/books/relativity/intro.md"
    );
  });

  it("keeps two books' same-named sections in separate files", () => {
    // The whole point: a flat layout mapped both of these onto one path and
    // the second pull clobbered the first.
    const a = articlePath("alice", { slug: "intro", parentBookSlug: "relativity" }, "md");
    const b = articlePath("alice", { slug: "intro", parentBookSlug: "mechanics" }, "md");
    expect(a).not.toBe(b);
  });

  it("honours the configured extension", () => {
    expect(articlePath("alice", { slug: "intro", parentBookSlug: null }, "mdx")).toBe(
      "alice/articles/intro.mdx"
    );
  });
});

describe("bookNotePath", () => {
  it("sits alongside the folder of sections it lists, not inside it", () => {
    expect(bookNotePath("alice", "relativity", "md")).toBe("alice/books/relativity.md");
    // Must not collide with any section file inside alice/books/relativity/
    expect(bookNotePath("alice", "relativity", "md")).not.toBe(
      articlePath("alice", { slug: "relativity", parentBookSlug: "relativity" }, "md")
    );
  });
});

describe("bookFromPath", () => {
  it("extracts the book from a section path", () => {
    expect(bookFromPath("alice/books/relativity/intro.md")).toBe("relativity");
  });

  it("returns null for a standalone article", () => {
    expect(bookFromPath("alice/articles/intro.md")).toBeNull();
  });

  it("returns null for a book index note", () => {
    expect(bookFromPath("alice/books/relativity.md")).toBeNull();
  });
});

describe("articleKey", () => {
  it("distinguishes same-named sections of different books", () => {
    expect(articleKey("alice", "intro", "relativity")).not.toBe(
      articleKey("alice", "intro", "mechanics")
    );
  });

  it("distinguishes a standalone article from a section with the same slug", () => {
    expect(articleKey("alice", "intro", null)).not.toBe(articleKey("alice", "intro", "relativity"));
  });

  it("is stable for the same inputs", () => {
    expect(articleKey("alice", "intro", "relativity")).toBe(
      articleKey("alice", "intro", "relativity")
    );
  });
});
