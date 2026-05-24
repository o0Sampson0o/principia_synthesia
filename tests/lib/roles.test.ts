// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  };
});

import { canEditContent } from "@/lib/roles";
import type { SessionPayload } from "@/lib/auth";

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    userId: 1,
    email: "user@example.com",
    userSlug: "user",
    isRootAdmin: false,
    ...overrides,
  };
}

function setupSelectSequence(responses: unknown[][]) {
  let callCount = 0;
  mockSelect.mockImplementation(() => {
    const response = responses[callCount] ?? [];
    callCount++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(response),
        }),
      }),
    };
  });
}

describe("canEditContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for null session", async () => {
    expect(await canEditContent(null, "user", 1)).toBe(false);
  });

  it("returns true for root admin regardless of owner type", async () => {
    const session = makeSession({ isRootAdmin: true });
    expect(await canEditContent(session, "user", 99)).toBe(true);
    expect(await canEditContent(session, "org", 99)).toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  describe("user-owned content", () => {
    it("returns false when userId does not match ownerId", async () => {
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "user", 2)).toBe(false);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns false when email is not verified (emailVerifiedAt is null)", async () => {
      setupSelectSequence([[{ emailVerifiedAt: null }]]);
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "user", 1)).toBe(false);
    });

    it("returns true when userId matches and email is verified", async () => {
      setupSelectSequence([[{ emailVerifiedAt: new Date("2024-01-01") }]]);
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "user", 1)).toBe(true);
    });
  });

  describe("org-owned content", () => {
    it("returns true for org super_admin regardless of emailVerifiedAt", async () => {
      setupSelectSequence([[{ role: "super_admin" }]]);
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "org", 10)).toBe(true);
    });

    it("returns true for org admin regardless of emailVerifiedAt", async () => {
      setupSelectSequence([[{ role: "admin" }]]);
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "org", 10)).toBe(true);
    });

    it("returns false for org member (insufficient role)", async () => {
      setupSelectSequence([[{ role: "member" }]]);
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "org", 10)).toBe(false);
    });

    it("returns false when not an org member (emailVerifiedAt is null — no DB call for it)", async () => {
      setupSelectSequence([[]]);
      const session = makeSession({ userId: 1 });
      expect(await canEditContent(session, "org", 10)).toBe(false);
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });
  });
});
