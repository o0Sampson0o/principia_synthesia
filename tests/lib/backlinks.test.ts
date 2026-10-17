import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/db", () => ({ db: {} }));

import { linksTo } from "@/lib/backlinks";

const standalone = { articleId: 1, publisherSlug: "alice", slug: "article-sets" };
const section = { articleId: 2, publisherSlug: "alice", slug: "article-intro", bookSlug: "book-algebra" };

describe("linksTo", () => {
  it("matches a standalone article, with or without a label", () => {
    expect(linksTo("see [[alice:articles:article-sets]]", standalone)).toBe(true);
    expect(linksTo("see [[alice:articles:article-sets|Sets]]", standalone)).toBe(true);
  });

  it("does not match a slug that merely starts the same", () => {
    expect(linksTo("[[alice:articles:article-sets-2]]", standalone)).toBe(false);
  });

  it("does not match another publisher's same slug", () => {
    expect(linksTo("[[bob:articles:article-sets]]", standalone)).toBe(false);
  });

  it("matches a book section by its book-qualified link, and by the bare form", () => {
    expect(linksTo("[[alice:books:book-algebra:article-intro|Intro]]", section)).toBe(true);
    expect(linksTo("[[alice:articles:article-intro]]", section)).toBe(true);
  });

  it("does not match the same section slug in another book", () => {
    expect(linksTo("[[alice:books:book-geometry:article-intro]]", section)).toBe(false);
  });

  it("ignores text that only looks like a link", () => {
    expect(linksTo("`alice:articles:article-sets`", standalone)).toBe(false);
  });
});
