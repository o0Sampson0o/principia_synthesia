// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { select: mockSelect },
}));

// ─── Drizzle-orm — pass through ───────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  getPerArticleStats,
  getDailyViews,
  getSourceBreakdown,
} from "@/lib/analytics-queries";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a "multi-thenable" — an object that is both awaitable (resolves to
 * `result`) and has chainable methods (.groupBy, .orderBy) that are also
 * awaitable and resolve to `result`.
 */
function makeChainable(result: unknown[]): Record<string, unknown> {
  const orderBy = vi.fn();
  orderBy.mockReturnValue(Promise.resolve(result));

  const groupBy = vi.fn();
  // groupBy returns an object with orderBy that resolves, and is itself awaitable
  const groupByResult: Record<string, unknown> = { orderBy };
  groupByResult.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  groupBy.mockReturnValue(groupByResult);

  const obj: Record<string, unknown> = { groupBy, orderBy };
  // Make obj itself awaitable (for `.from().where()` terminal)
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

/**
 * Sets up mockSelect to return successive arrays of results, one per
 * db.select() call.
 *
 * Chains observed in analytics-queries.ts:
 *   articles list  → .from().where()              (terminal = where)
 *   total/unique   → .from().where().groupBy()     (terminal = groupBy)
 *   daily views    → .from().where().groupBy().orderBy()  (terminal = orderBy)
 *
 * We build each chain so every stage is chainable and the terminal resolves.
 */
function setupSelectResponses(...responses: unknown[][]) {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const result = responses[idx++] ?? [];
    const chainable = makeChainable(result);
    const whereFn = vi.fn().mockReturnValue(chainable);
    const from = vi.fn().mockReturnValue({ where: whereFn });
    return { from };
  });
}

// ─── getPerArticleStats ───────────────────────────────────────────────────────

describe("getPerArticleStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no articles", async () => {
    // First select: articles → empty
    setupSelectResponses([]);
    const result = await getPerArticleStats("user", 1);
    expect(result).toEqual([]);
  });

  it("returns stats merged from four queries", async () => {
    // call 1: articles list
    // call 2: total views
    // call 3: unique sessions
    // call 4: last30 views
    setupSelectResponses(
      [{ id: 10, slug: "my-article", title: "My Article" }],
      [{ articleId: 10, total: 100 }],
      [{ articleId: 10, unique: 42 }],
      [{ articleId: 10, last30: 25 }]
    );

    const result = await getPerArticleStats("user", 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      articleId: 10,
      slug: "my-article",
      title: "My Article",
      totalViews: 100,
      uniqueViews: 42,
      last30dViews: 25,
    });
  });

  it("defaults to zero when an article has no view rows", async () => {
    setupSelectResponses(
      [{ id: 20, slug: "new-article", title: "New Article" }],
      [], // no total rows
      [], // no unique rows
      []  // no last30 rows
    );

    const result = await getPerArticleStats("org", 5);
    expect(result[0]).toMatchObject({
      articleId: 20,
      totalViews: 0,
      uniqueViews: 0,
      last30dViews: 0,
    });
  });
});

// ─── getDailyViews ────────────────────────────────────────────────────────────

describe("getDailyViews", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no rows", async () => {
    setupSelectResponses([]);
    const result = await getDailyViews(10, 30);
    expect(result).toEqual([]);
  });

  it("maps rows to { day, views } with numeric coercion", async () => {
    setupSelectResponses([
      { day: "2026-05-01", views: "5" },
      { day: "2026-05-02", views: "12" },
    ]);
    const result = await getDailyViews(10, 30);
    expect(result).toEqual([
      { day: "2026-05-01", views: 5 },
      { day: "2026-05-02", views: 12 },
    ]);
  });
});

// ─── getSourceBreakdown ───────────────────────────────────────────────────────

describe("getSourceBreakdown", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zeroes for all sources when no rows", async () => {
    setupSelectResponses([]);
    const result = await getSourceBreakdown(10, 30);
    expect(result).toEqual({
      direct: 0,
      search: 0,
      social: 0,
      internal: 0,
      external: 0,
    });
  });

  it("fills in known sources and rolls NULL into direct", async () => {
    setupSelectResponses([
      { source: "search", views: "8" },
      { source: "social", views: "3" },
      { source: null, views: "15" }, // legacy rows
    ]);
    const result = await getSourceBreakdown(10, 30);
    expect(result.search).toBe(8);
    expect(result.social).toBe(3);
    // null source → direct
    expect(result.direct).toBe(15);
    expect(result.internal).toBe(0);
    expect(result.external).toBe(0);
  });
});
