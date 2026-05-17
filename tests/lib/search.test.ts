// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockSelectWhereLimit = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectLeftJoin = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

// ─── drizzle-orm — spy on and so we can capture what conditions it received ───

const capturedAndCalls: unknown[][] = [];

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args: unknown[]) => {
      capturedAndCalls.push(args);
      return actual.and(...(args as Parameters<typeof actual.and>));
    }),
  };
});

import { searchAll } from "@/lib/search";
import { and } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupEmptyResults() {
  mockSelectWhereLimit.mockResolvedValue([]);
  mockSelectWhere.mockReturnValue({ limit: mockSelectWhereLimit });
  mockSelectLeftJoin.mockReturnValue({ where: mockSelectWhere });
  mockSelectFrom.mockReturnValue({
    leftJoin: mockSelectLeftJoin,
    where: mockSelectWhere,
  });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

/**
 * Walks the `and()` call arguments captured during a searchAll() run.
 * Returns true if any argument is a Drizzle SQL template object whose
 * queryChunks value arrays contain the string "status".
 *
 * Drizzle's sql`` tag produces: { queryChunks: [{ value: [string] }, ...] }
 */
function hasStatusCondition(calls: unknown[][]): boolean {
  for (const args of calls) {
    for (const arg of args) {
      if (arg == null) continue;
      if (typeof arg !== "object") continue;
      const obj = arg as Record<string, unknown>;
      if (!Array.isArray(obj["queryChunks"])) continue;
      const chunks = obj["queryChunks"] as Array<{ value?: unknown[] }>;
      for (const chunk of chunks) {
        if (!Array.isArray(chunk?.value)) continue;
        for (const v of chunk.value) {
          if (typeof v === "string" && v.includes("status")) return true;
        }
      }
    }
  }
  return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("searchAll — article status filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAndCalls.length = 0;
    setupEmptyResults();
  });

  it("includes the status = 'published' condition for a non-admin session", async () => {
    mockGetSession.mockResolvedValue({
      userId: 5,
      email: "bob@example.com",
      userSlug: "bob",
      isRootAdmin: false,
    });

    await searchAll("math");

    expect(vi.mocked(and)).toHaveBeenCalled();
    expect(hasStatusCondition(capturedAndCalls)).toBe(true);
  });

  it("omits the status condition for a root admin session", async () => {
    mockGetSession.mockResolvedValue({
      userId: 1,
      email: "admin@example.com",
      userSlug: "admin",
      isRootAdmin: true,
    });

    await searchAll("math");

    expect(vi.mocked(and)).toHaveBeenCalled();
    // Root admin: ternary returns undefined → no status SQL chunk in any and() call
    expect(hasStatusCondition(capturedAndCalls)).toBe(false);
  });

  it("returns results without error and applies status filter for anonymous (null) session", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await searchAll("physics");

    expect(result).toHaveProperty("articles");
    expect(result).toHaveProperty("books");
    expect(result).toHaveProperty("objects");
    // Anonymous session is non-admin → status filter must be present
    expect(hasStatusCondition(capturedAndCalls)).toBe(true);
  });
});
