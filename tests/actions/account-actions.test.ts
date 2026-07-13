// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: {
    get select() { return mockSelect; },
    get update() { return mockUpdate; },
  },
}));

const mockRequireSession = vi.hoisted(() => vi.fn());
const mockHashPassword = vi.hoisted(() => vi.fn());
const mockVerifyPassword = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  requireSession: mockRequireSession,
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateDisplayName, changePassword } from "@/app/settings/account/actions";

const SESSION = { userId: 10, email: "a@b.c", userSlug: "alice", isRootAdmin: false };

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

function setupSelect(row: object | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mockSelect.mockReturnValue({ from });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION);
  mockUpdateWhere.mockResolvedValue({ rowCount: 1 });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
});

describe("updateDisplayName", () => {
  it("updates and returns ok", async () => {
    const res = await updateDisplayName(fd({ displayName: "New Name" }));
    expect(res).toEqual({ ok: true, message: "Display name updated." });
    expect(mockUpdateSet).toHaveBeenCalledWith({ displayName: "New Name" });
  });

  it("rejects an empty name without writing", async () => {
    const res = await updateDisplayName(fd({ displayName: "  " }));
    expect(res.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  it("rejects a wrong current password without writing", async () => {
    setupSelect({ passwordHash: "storedhash" });
    mockVerifyPassword.mockResolvedValue(false);
    const res = await changePassword(fd({ currentPassword: "wrong", newPassword: "longenough123" }));
    expect(res).toEqual({ ok: false, error: "Current password is incorrect." });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a too-short new password before touching the DB", async () => {
    const res = await changePassword(fd({ currentPassword: "x", newPassword: "short" }));
    expect(res.ok).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("hashes and stores the new password when the current one verifies", async () => {
    setupSelect({ passwordHash: "storedhash" });
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("newhash");
    const res = await changePassword(fd({ currentPassword: "right", newPassword: "longenough123" }));
    expect(res).toEqual({ ok: true, message: "Password changed." });
    expect(mockVerifyPassword).toHaveBeenCalledWith("right", "storedhash");
    expect(mockUpdateSet).toHaveBeenCalledWith({ passwordHash: "newhash" });
  });
});
