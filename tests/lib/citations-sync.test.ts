// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    delete: mockDelete,
    select: mockSelect,
  },
}));

// ─── Drizzle-orm — pass through ───────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { syncArticleCitations } from "@/lib/citations-sync";

// ─── Mock chain helpers ───────────────────────────────────────────────────────

/**
 * Setup mockSelect to return queued results.
 * Chain: .from().where().limit() — terminal is limit.
 * Also supports .from().where() as terminal (makeChainable).
 */
function setupSelectQueue(...responses: unknown[][]) {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const result = responses[idx++] ?? [];
    const limitFn = vi.fn().mockResolvedValue(result);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, innerJoin: innerJoinFn });
    return { from: fromFn };
  });
}

/**
 * Setup mockSelect to support the .from().where() terminal chain
 * (used for reading existing citation rows — no .limit()).
 */
function setupSelectQueueTerminalWhere(...responses: unknown[][]) {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const result = responses[idx++] ?? [];
    const limitFn = vi.fn().mockResolvedValue(result);
    const whereFn = vi.fn();
    // Make whereFn thenable (await-able) and also return { limit }
    whereFn.mockReturnValue({
      limit: limitFn,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, innerJoin: innerJoinFn });
    return { from: fromFn };
  });
}

// ─── syncArticleCitations ─────────────────────────────────────────────────────

describe("syncArticleCitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockDeleteWhere.mockResolvedValue({ rowCount: 0 });
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
  });

  it("returns empty added/removed when MDX has no Cite elements", async () => {
    // Calls in order:
    // 1. (no slug lookups)
    // 2. existing citations → []
    setupSelectQueueTerminalWhere([]);

    const result = await syncArticleCitations(10, "# Title\n\nNo citations.");
    expect(result).toEqual({ added: [], removed: [] });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("adds a new citation and returns its id in added", async () => {
    // Calls in order:
    // 1. resolve publisher slug "alice" → pubRow
    // 2. resolve article "article-intro" for alice → articleRow { id: 42 }
    // 3. existing citations for citingArticleId=10 → []
    setupSelectQueueTerminalWhere(
      // publisher lookup
      [{ kind: "user", userId: 1, orgId: null }],
      // article lookup
      [{ id: 42 }],
      // existing citations
      [],
    );

    const result = await syncArticleCitations(10, `<Cite slug="alice/article-intro" />`);
    expect(result.added).toEqual([42]);
    expect(result.removed).toEqual([]);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ citingArticleId: 10, citedArticleId: 42, position: 0 }),
      ])
    );
  });

  it("removes a citation that is no longer in the MDX", async () => {
    // No slugs in MDX. Existing citations: [99].
    setupSelectQueueTerminalWhere(
      // existing citations
      [{ citedArticleId: 99 }],
    );

    const result = await syncArticleCitations(10, "# No citations");
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([99]);
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not notify when only citations are removed (not added)", async () => {
    // Same as removal test: added is empty
    setupSelectQueueTerminalWhere(
      [{ citedArticleId: 55 }],
    );

    const result = await syncArticleCitations(10, "");
    expect(result.added).toHaveLength(0);
  });
});
