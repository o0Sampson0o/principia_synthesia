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

import { findArticleBySlug } from "@/lib/article-lookup";

const OWNER = { ownerType: "user" as const, ownerId: 1 };

/** One joined row: the article plus its book's slug (null when standalone). */
function row(id: number, slug: string, parentBookSlug: string | null) {
  return {
    article: {
      id,
      slug,
      parentBookId: parentBookSlug === null ? null : id * 100,
      title: `Article ${id}`,
    },
    parentBookSlug,
  };
}

/**
 * Stubs the single `select().from().leftJoin().where()` chain, awaited directly.
 * Asserting the chain shape here is deliberate: the resolver must stay one
 * query, since the article page runs it twice per request.
 */
function stubJoinQuery(rows: object[]) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromResult: Record<string, unknown> = { where: whereFn };
  fromResult.leftJoin = vi.fn().mockReturnValue(fromResult);
  mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(fromResult) });
  return { whereFn };
}

describe("findArticleBySlug", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("returns not-found when nothing matches", async () => {
    stubJoinQuery([]);
    expect((await findArticleBySlug({ ...OWNER, slug: "nope" })).kind).toBe("not-found");
  });

  it("resolves a standalone article by bare slug", async () => {
    stubJoinQuery([row(7, "intro", null)]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { id: 7, parentBookSlug: null } });
  });

  it("resolves a lone internal article, so old bare wikilinks keep working", async () => {
    stubJoinQuery([row(9, "intro", "relativity")]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { id: 9 } });
  });

  it("reports ambiguity when two books share a section slug", async () => {
    stubJoinQuery([row(9, "intro", "relativity"), row(10, "intro", "mechanics")]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.matches).toHaveLength(2);
  });

  it("prefers the standalone article when a section shares its slug", async () => {
    stubJoinQuery([row(9, "intro", "relativity"), row(11, "intro", null)]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { id: 11 } });
  });

  it("scopes to the requested book", async () => {
    stubJoinQuery([row(9, "intro", "relativity"), row(10, "intro", "mechanics")]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro", bookSlug: "mechanics" });
    expect(r).toMatchObject({ kind: "found", article: { id: 10 } });
  });

  it("falls back to the standalone article when the book has no such section", async () => {
    // A stale `?book=` must not hide an article that is otherwise resolvable.
    stubJoinQuery([row(11, "intro", null)]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro", bookSlug: "ghost" });
    expect(r).toMatchObject({ kind: "found", article: { id: 11 } });
  });

  it("surfaces the book slug so callers need no second query", async () => {
    stubJoinQuery([row(9, "intro", "relativity")]);
    const r = await findArticleBySlug({ ...OWNER, slug: "intro" });
    expect(r).toMatchObject({ kind: "found", article: { parentBookSlug: "relativity" } });
  });

  it("resolves in exactly one query", async () => {
    stubJoinQuery([row(9, "intro", "relativity"), row(10, "intro", "mechanics")]);
    await findArticleBySlug({ ...OWNER, slug: "intro", bookSlug: "mechanics" });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
