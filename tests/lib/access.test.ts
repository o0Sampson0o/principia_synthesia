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

import { canView, filterVisible } from "@/lib/access";
import type { ContentRef } from "@/lib/access";
import type { SessionPayload } from "@/lib/auth";
import { setupSelectQueue } from "@/tests/helpers/drizzle-mocks";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRootAdminSession(): SessionPayload {
  return { userId: 1, email: "admin@example.com", userSlug: "admin", isRootAdmin: true };
}

function makeUserSession(userId = 2): SessionPayload {
  return { userId, email: "user@example.com", userSlug: "user", isRootAdmin: false };
}

function makeRef(overrides: Partial<ContentRef> = {}): ContentRef {
  return {
    type: "article",
    ownerType: "user",
    ownerId: 10,
    slug: "article-test",
    ...overrides,
  };
}

// ─── canView ─────────────────────────────────────────────────────────────────

describe("canView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("root admin session → true without any DB hit", async () => {
    const result = await canView(makeRef(), makeRootAdminSession());
    expect(result).toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("no visibility row → true (public default)", async () => {
    // getVisibility → [] → defaults to 'public'
    setupSelectQueue(mockSelect,[{ result: [], withLimit: true }]);
    const result = await canView(makeRef(), null);
    expect(result).toBe(true);
  });

  it("visibility row with visibility='public' → true", async () => {
    setupSelectQueue(mockSelect,[{ result: [{ visibility: "public" }], withLimit: true }]);
    const result = await canView(makeRef(), null);
    expect(result).toBe(true);
  });

  it("private + no session → false", async () => {
    setupSelectQueue(mockSelect,[{ result: [{ visibility: "private" }], withLimit: true }]);
    const result = await canView(makeRef(), null);
    expect(result).toBe(false);
  });

  it("private + session has user grant → true", async () => {
    // 1. getVisibility → private  (withLimit)
    // 2. getUserOrgIds → []  (no limit — .where() is terminal)
    // 3. user grant check → [{ id: 5 }]  (withLimit)
    setupSelectQueue(mockSelect,[
      { result: [{ visibility: "private" }], withLimit: true },
      { result: [], withLimit: false },
      { result: [{ id: 5 }], withLimit: true },
    ]);
    const result = await canView(makeRef(), makeUserSession());
    expect(result).toBe(true);
  });

  it("private + session has org grant via membership → true", async () => {
    // 1. getVisibility → private
    // 2. getUserOrgIds → [{ orgId: 3 }]
    // 3. user grant → []
    // 4. org grant → [{ id: 7 }]
    setupSelectQueue(mockSelect,[
      { result: [{ visibility: "private" }], withLimit: true },
      { result: [{ orgId: 3 }], withLimit: false },
      { result: [], withLimit: true },
      { result: [{ id: 7 }], withLimit: true },
    ]);
    const result = await canView(makeRef(), makeUserSession());
    expect(result).toBe(true);
  });

  it("private + session has neither user nor org grant → false", async () => {
    setupSelectQueue(mockSelect,[
      { result: [{ visibility: "private" }], withLimit: true },
      { result: [{ orgId: 3 }], withLimit: false },
      { result: [], withLimit: true },
      { result: [], withLimit: true },
    ]);
    const result = await canView(makeRef(), makeUserSession());
    expect(result).toBe(false);
  });

  it("org visibility + org-owned content + user is member → true", async () => {
    // 1. getVisibility → org
    // 2. getUserOrgIds → [{ orgId: 10 }]  (matches ownerId=10)
    setupSelectQueue(mockSelect,[
      { result: [{ visibility: "org" }], withLimit: true },
      { result: [{ orgId: 10 }], withLimit: false },
    ]);
    const result = await canView(
      makeRef({ ownerType: "org", ownerId: 10 }),
      makeUserSession()
    );
    expect(result).toBe(true);
  });

  it("org visibility + org-owned content + user is NOT member → false", async () => {
    setupSelectQueue(mockSelect,[
      { result: [{ visibility: "org" }], withLimit: true },
      { result: [{ orgId: 99 }], withLimit: false },
    ]);
    const result = await canView(
      makeRef({ ownerType: "org", ownerId: 10 }),
      makeUserSession()
    );
    expect(result).toBe(false);
  });
});

  it("canView with type 'event' and no visibility row returns true (public default)", async () => {
    setupSelectQueue(mockSelect,[{ result: [], withLimit: true }]);
    const result = await canView(makeRef({ type: "event", slug: "event-foo" }), null);
    expect(result).toBe(true);
  });

  it("canView with type 'event' and private visibility respects grants", async () => {
    setupSelectQueue(mockSelect,[
      { result: [{ visibility: "private" }], withLimit: true },
      { result: [], withLimit: false },
      { result: [{ id: 9 }], withLimit: true },
    ]);
    const result = await canView(
      makeRef({ type: "event", slug: "event-foo" }),
      makeUserSession()
    );
    expect(result).toBe(true);
  });

// ─── filterVisible ────────────────────────────────────────────────────────────

describe("filterVisible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("root admin → returns all refs without DB hit", async () => {
    const refs = [makeRef({ slug: "article-a" }), makeRef({ slug: "article-b" })];
    const result = await filterVisible(refs, makeRootAdminSession());
    expect(result).toEqual(refs);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("empty input → empty array without DB hit", async () => {
    const result = await filterVisible([], null);
    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("all refs public (no visibility rows) → all returned", async () => {
    // filterVisible fetches visibility for each owner pair; no rows → all public
    // The implementation does a Promise.all over owner pairs; for one owner pair
    // it issues one select().from().where() (no limit) returning []
    const refs = [makeRef({ slug: "article-a" }), makeRef({ slug: "article-b" })];

    // One query per unique ownerType:ownerId pair
    mockSelect.mockImplementation(() => {
      const whereFn = vi.fn().mockResolvedValue([]);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      return { from: fromFn };
    });

    const result = await filterVisible(refs, null);
    expect(result).toHaveLength(2);
  });

  it("mix of public and private → only public returned when no session", async () => {
    const refs = [
      makeRef({ slug: "article-a" }),
      makeRef({ slug: "article-b" }),
    ];

    // Visibility rows: article-b is private
    mockSelect.mockImplementationOnce(() => {
      const whereFn = vi.fn().mockResolvedValue([
        {
          resourceType: "article",
          ownerType: "user",
          ownerId: 10,
          resourceKey: "article-b",
          visibility: "private",
        },
      ]);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      return { from: fromFn };
    });

    const result = await filterVisible(refs, null);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("article-a");
  });
});
