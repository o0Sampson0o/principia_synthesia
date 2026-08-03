// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: {
    get select() {
      return mockSelect;
    },
  },
}));

import { setupSelectQueue } from "../helpers/drizzle-mocks";
import { findArticleBySlug } from "@/lib/article-lookup";

const OWNER = { ownerType: "user" as const, ownerId: 1 };

/** Minimal article row shape — only the fields the resolver reads. */
function article(id: number, slug: string, parentBookId: number | null) {
  return { id, slug, parentBookId, title: `Article ${id}` };
}

describe("findArticleBySlug", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("returns not-found when nothing matches", async () => {
    setupSelectQueue(mockSelect, [{ result: [], withLimit: false }]);
    const r = await findArticleBySlug({ ...OWNER, slug: "nope" });
    expect(r.kind).toBe("not-found");
  });

  it("resolves a standalone article by bare slug", async () => {
    setupSelectQueue(mockSelect, [{ result: [article(7, "intro", null)], withLimit: false }]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { id: 7 } });
  });

  it("resolves a lone internal article by bare slug, so old wikilinks keep working", async () => {
    setupSelectQueue(mockSelect, [{ result: [article(9, "intro", 3)], withLimit: false }]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { id: 9 } });
  });

  it("reports ambiguity when two books share a section slug", async () => {
    setupSelectQueue(mockSelect, [
      { result: [article(9, "intro", 3), article(10, "intro", 4)], withLimit: false },
    ]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.matches).toHaveLength(2);
  });

  it("prefers the standalone article when a book section shares its slug", async () => {
    setupSelectQueue(mockSelect, [
      { result: [article(9, "intro", 3), article(11, "intro", null)], withLimit: false },
    ]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { id: 11 } });
  });

  it("scopes to the requested book, picking that book's section", async () => {
    setupSelectQueue(mockSelect, [
      { result: [{ id: 4 }], withLimit: true }, // book lookup
      { result: [article(10, "intro", 4)], withLimit: true }, // scoped article
    ]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro", bookSlug: "mechanics" });
    expect(r).toMatchObject({ kind: "found", article: { id: 10 } });
  });

  it("falls back to the unscoped search when the book has no such section", async () => {
    // A stale `?book=` must not hide an article that is otherwise resolvable.
    setupSelectQueue(mockSelect, [
      { result: [{ id: 4 }], withLimit: true }, // book exists
      { result: [], withLimit: true }, // but has no such section
      { result: [article(11, "intro", null)], withLimit: false }, // standalone wins
    ]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro", bookSlug: "mechanics" });
    expect(r).toMatchObject({ kind: "found", article: { id: 11 } });
  });

  it("falls back when the named book does not exist", async () => {
    setupSelectQueue(mockSelect, [
      { result: [], withLimit: true }, // no such book
      { result: [article(11, "intro", null)], withLimit: false },
    ]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro", bookSlug: "ghost" });
    expect(r).toMatchObject({ kind: "found", article: { id: 11 } });
  });
});
