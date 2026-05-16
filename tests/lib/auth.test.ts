// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.AUTH_SECRET = "test-secret-32-chars-long-enough";

const mockCookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getSession,
} from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";

const testPayload: SessionPayload = {
  userId: 42,
  email: "test@example.com",
  userSlug: "test-user",
  isRootAdmin: true,
};

const stalePayload = {
  userId: 42,
  email: "test@example.com",
  isAdmin: true, // old shape, missing userSlug and isRootAdmin
};

describe("hashPassword / verifyPassword", () => {
  it("round-trips: verifyPassword returns true for the correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const result = await verifyPassword("correct-horse-battery", hash);
    expect(result).toBe(true);
  });

  it("returns false for an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const result = await verifyPassword("wrong-password", hash);
    expect(result).toBe(false);
  });

  it("hashes are unique (salted)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("createSessionToken returns a non-empty string", async () => {
    const token = await createSessionToken(testPayload);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("verifySessionToken round-trips the payload", async () => {
    const token = await createSessionToken(testPayload);
    const result = await verifySessionToken(token);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(testPayload.userId);
    expect(result!.email).toBe(testPayload.email);
    expect(result!.userSlug).toBe(testPayload.userSlug);
    expect(result!.isRootAdmin).toBe(testPayload.isRootAdmin);
  });

  it("verifySessionToken returns null for a garbage token", async () => {
    const result = await verifySessionToken("not.a.valid.jwt");
    expect(result).toBeNull();
  });

  it("verifySessionToken returns null for a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const otherSecret = new TextEncoder().encode("a-completely-different-secret");
    const token = await new SignJWT(testPayload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(otherSecret);
    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });

  it("verifySessionToken returns null for an expired token", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(
      process.env.AUTH_SECRET || "dev-secret-change-in-production"
    );
    const token = await new SignJWT(testPayload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("-1s")
      .sign(secret);
    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });
});

describe("getSession", () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset();
    mockCookieStore.set.mockReset();
  });

  it("returns null when no session cookie is set", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const result = await getSession();
    expect(result).toBeNull();
  });

  it("returns null when cookie value is an empty string", async () => {
    mockCookieStore.get.mockReturnValue({ value: "" });
    const result = await getSession();
    expect(result).toBeNull();
  });

  it("returns the payload when a valid session cookie is set", async () => {
    const token = await createSessionToken(testPayload);
    mockCookieStore.get.mockReturnValue({ value: token });
    const result = await getSession();
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(testPayload.userId);
    expect(result!.email).toBe(testPayload.email);
    expect(result!.userSlug).toBe(testPayload.userSlug);
    expect(result!.isRootAdmin).toBe(testPayload.isRootAdmin);
  });

  it("returns null when cookie contains an invalid token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "garbage.token.here" });
    const result = await getSession();
    expect(result).toBeNull();
  });

  it("clears cookie and returns null when cookie has stale (pre-redesign) shape", async () => {
    const { SignJWT } = await import("jose");
    // Use the same secret the auth module sees at import time.
    // ESM imports are hoisted, so lib/auth.ts is loaded before the
    // process.env.AUTH_SECRET assignment at the top of this file runs.
    // The auth module therefore uses the fallback "dev-secret-change-in-production".
    const secret = new TextEncoder().encode("dev-secret-change-in-production");
    const token = await new SignJWT(stalePayload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
    mockCookieStore.get.mockReturnValue({ value: token });
    const result = await getSession();
    expect(result).toBeNull();
    // Cookie cleared
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "session",
      "",
      expect.objectContaining({ maxAge: 0 })
    );
  });
});
