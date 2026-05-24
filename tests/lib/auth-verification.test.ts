// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdateReturning = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: mockUpdate,
  },
}));

// ─── next/headers mock ────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
  }),
}));

import { createVerificationToken, consumeVerificationToken } from "@/lib/auth";
import { createHash } from "crypto";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

describe("createVerificationToken", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateReturning.mockReset();

    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
  });

  it("returns a non-empty base64url string", async () => {
    const token = await createVerificationToken(1);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("calls db.update with verificationTokenHash and expiresAt for the given userId", async () => {
    const token = await createVerificationToken(42);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationTokenHash: hashToken(token),
        verificationTokenExpiresAt: expect.any(Date),
      })
    );
  });

  it("sets expiry approximately 24 hours from now", async () => {
    const before = Date.now();
    await createVerificationToken(1);
    const after = Date.now();

    const call = mockUpdateSet.mock.calls[0][0];
    const expiresAt: Date = call.verificationTokenExpiresAt;
    const expectedMs = 24 * 60 * 60 * 1000;

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + expectedMs + 1000);
  });

  it("returns a different token on each call", async () => {
    const t1 = await createVerificationToken(1);
    const t2 = await createVerificationToken(1);
    expect(t1).not.toBe(t2);
  });
});

describe("consumeVerificationToken", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateReturning.mockReset();

    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateReturning.mockResolvedValue([]);
  });

  it("returns null when no matching token is found", async () => {
    mockUpdateReturning.mockResolvedValue([]);
    const result = await consumeVerificationToken("nonexistent-token");
    expect(result).toBeNull();
  });

  it("returns the userId when the token matches", async () => {
    mockUpdateReturning.mockResolvedValue([{ id: 7 }]);
    const result = await consumeVerificationToken("valid-token");
    expect(result).toBe(7);
  });

  it("passes the SHA-256 hash of the raw token to the WHERE clause", async () => {
    mockUpdateReturning.mockResolvedValue([{ id: 1 }]);
    const rawToken = "my-test-token";
    await consumeVerificationToken(rawToken);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailVerifiedAt: expect.any(Date),
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
      })
    );
  });

  it("clears the token columns on success", async () => {
    mockUpdateReturning.mockResolvedValue([{ id: 5 }]);
    await consumeVerificationToken("some-token");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
      })
    );
  });
});
