// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    and: vi.fn((...args) => ({ _type: "and", args })),
    inArray: vi.fn((col, vals) => ({ _type: "inArray", col, vals })),
  };
});

import { canViewBook, canViewArticle, getVisibleBookSlugs, getVisibleArticleSlugs } from "@/lib/access";
import type { SessionPayload } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdminSession(): SessionPayload {
  return { userId: 1, email: "admin@example.com", isAdmin: true };
}

function makeUserSession(userId = 2): SessionPayload {
  return { userId, email: "user@example.com", isAdmin: false };
}

/**
 * Creates a mock DB chain where each call to db.select() consumes one
 * result from the `resultQueue`. Results with `withLimit: true` attach a
 * `.limit()` terminal; otherwise `.where()` is the terminal.
 */
function setupQueryQueue(queue: Array<{ result: any[]; withLimit?: boolean }>) {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const item = queue[idx++] ?? { result: [], withLimit: true };
    const limitFn = vi.fn().mockResolvedValue(item.result);
    const whereFn = vi.fn();
    if (item.withLimit) {
      whereFn.mockReturnValue({ limit: limitFn });
    } else {
      whereFn.mockResolvedValue(item.result);
    }
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    return { from: fromFn };
  });
}

// ─── canViewBook ──────────────────────────────────────────────────────────────

describe("canViewBook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin session → true without any DB hit", async () => {
    const result = await canViewBook("my-book", makeAdminSession());
    expect(result).toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("no visibility row → true (public default)", async () => {
    // isPrivate: .select().from().where().limit(1) → []
    setupQueryQueue([{ result: [], withLimit: true }]);
    const result = await canViewBook("my-book", null);
    expect(result).toBe(true);
  });

  it("visibility row with isPrivate=false → true", async () => {
    setupQueryQueue([{ result: [{ isPrivate: false }], withLimit: true }]);
    const result = await canViewBook("my-book", null);
    expect(result).toBe(true);
  });

  it("private + no session → false", async () => {
    setupQueryQueue([{ result: [{ isPrivate: true }], withLimit: true }]);
    const result = await canViewBook("my-book", null);
    expect(result).toBe(false);
  });

  it("private + session has user grant → true", async () => {
    // 1. isPrivate → true  (withLimit)
    // 2. getUserOrgIds → []  (no limit — .where() is terminal)
    // 3. user grant check → [{ id: 5 }]  (withLimit)
    setupQueryQueue([
      { result: [{ isPrivate: true }], withLimit: true },
      { result: [], withLimit: false },
      { result: [{ id: 5 }], withLimit: true },
    ]);
    const result = await canViewBook("my-book", makeUserSession());
    expect(result).toBe(true);
  });

  it("private + session has org grant via membership → true", async () => {
    // 1. isPrivate → true
    // 2. getUserOrgIds → [{ orgId: 3 }]
    // 3. user grant → []
    // 4. org grant → [{ id: 7 }]
    setupQueryQueue([
      { result: [{ isPrivate: true }], withLimit: true },
      { result: [{ orgId: 3 }], withLimit: false },
      { result: [], withLimit: true },
      { result: [{ id: 7 }], withLimit: true },
    ]);
    const result = await canViewBook("my-book", makeUserSession());
    expect(result).toBe(true);
  });

  it("private + session has neither user nor org grant → false", async () => {
    setupQueryQueue([
      { result: [{ isPrivate: true }], withLimit: true },
      { result: [{ orgId: 3 }], withLimit: false },
      { result: [], withLimit: true },
      { result: [], withLimit: true },
    ]);
    const result = await canViewBook("my-book", makeUserSession());
    expect(result).toBe(false);
  });
});

// ─── canViewArticle ───────────────────────────────────────────────────────────

describe("canViewArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin session → true without any DB hit", async () => {
    const result = await canViewArticle("my-article", makeAdminSession());
    expect(result).toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("no visibility row → true (public default)", async () => {
    setupQueryQueue([{ result: [], withLimit: true }]);
    const result = await canViewArticle("my-article", null);
    expect(result).toBe(true);
  });

  it("visibility row with isPrivate=false → true", async () => {
    setupQueryQueue([{ result: [{ isPrivate: false }], withLimit: true }]);
    const result = await canViewArticle("my-article", null);
    expect(result).toBe(true);
  });

  it("private + no session → false", async () => {
    setupQueryQueue([{ result: [{ isPrivate: true }], withLimit: true }]);
    const result = await canViewArticle("my-article", null);
    expect(result).toBe(false);
  });

  it("private + session has user grant → true", async () => {
    setupQueryQueue([
      { result: [{ isPrivate: true }], withLimit: true },
      { result: [], withLimit: false },
      { result: [{ id: 5 }], withLimit: true },
    ]);
    const result = await canViewArticle("my-article", makeUserSession());
    expect(result).toBe(true);
  });

  it("private + session has org grant via membership → true", async () => {
    setupQueryQueue([
      { result: [{ isPrivate: true }], withLimit: true },
      { result: [{ orgId: 3 }], withLimit: false },
      { result: [], withLimit: true },
      { result: [{ id: 7 }], withLimit: true },
    ]);
    const result = await canViewArticle("my-article", makeUserSession());
    expect(result).toBe(true);
  });

  it("private + session has neither user nor org grant → false", async () => {
    setupQueryQueue([
      { result: [{ isPrivate: true }], withLimit: true },
      { result: [{ orgId: 3 }], withLimit: false },
      { result: [], withLimit: true },
      { result: [], withLimit: true },
    ]);
    const result = await canViewArticle("my-article", makeUserSession());
    expect(result).toBe(false);
  });
});

// ─── getVisibleBookSlugs ──────────────────────────────────────────────────────

describe("getVisibleBookSlugs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin → 'all'", async () => {
    const result = await getVisibleBookSlugs(makeAdminSession(), ["a", "b"]);
    expect(result).toBe("all");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("empty input → empty Set", async () => {
    const result = await getVisibleBookSlugs(null, []);
    expect(result).toBeInstanceOf(Set);
    expect((result as Set<string>).size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("all slugs public (no private rows) → all returned", async () => {
    // privateRows: no rows → all public
    setupQueryQueue([{ result: [], withLimit: false }]);
    const result = await getVisibleBookSlugs(null, ["book-a", "book-b"]);
    expect(result).toBeInstanceOf(Set);
    const s = result as Set<string>;
    expect(s.has("book-a")).toBe(true);
    expect(s.has("book-b")).toBe(true);
  });

  it("mix of public and private with no grants → only public returned", async () => {
    // no session provided → after privateRows, no more queries
    setupQueryQueue([
      { result: [{ resourceKey: "book-b" }], withLimit: false }, // privateRows
    ]);
    const result = await getVisibleBookSlugs(null, ["book-a", "book-b"]);
    const s = result as Set<string>;
    expect(s.has("book-a")).toBe(true);
    expect(s.has("book-b")).toBe(false);
  });

  it("private + user grant → grant slug included", async () => {
    // 1. privateRows → [book-b private]
    // 2. getUserOrgIds → []
    // 3. user grants → [{ resourceKey: "book-b" }]
    setupQueryQueue([
      { result: [{ resourceKey: "book-b" }], withLimit: false }, // privateRows
      { result: [], withLimit: false },                            // getUserOrgIds
      { result: [{ resourceKey: "book-b" }], withLimit: false },  // user grants
    ]);
    const result = await getVisibleBookSlugs(makeUserSession(), ["book-a", "book-b"]);
    const s = result as Set<string>;
    expect(s.has("book-a")).toBe(true);
    expect(s.has("book-b")).toBe(true);
  });

  it("private + org grant + member of org → grant slug included", async () => {
    // 1. privateRows → [book-b private]
    // 2. getUserOrgIds → [{ orgId: 5 }]
    // 3. user grants → []
    // 4. org grants → [{ resourceKey: "book-b" }]
    setupQueryQueue([
      { result: [{ resourceKey: "book-b" }], withLimit: false }, // privateRows
      { result: [{ orgId: 5 }], withLimit: false },               // getUserOrgIds
      { result: [], withLimit: false },                            // user grants
      { result: [{ resourceKey: "book-b" }], withLimit: false },  // org grants
    ]);
    const result = await getVisibleBookSlugs(makeUserSession(), ["book-a", "book-b"]);
    const s = result as Set<string>;
    expect(s.has("book-a")).toBe(true);
    expect(s.has("book-b")).toBe(true);
  });
});
