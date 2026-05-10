// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Set test secret before importing auth (JWT_SECRET is evaluated at module init)
process.env.AUTH_SECRET = "test-secret-32-chars-long-enough";

// vi.mock is hoisted before imports, so we cannot reference variables defined in
// this file inside the factory. Instead, we use vi.hoisted() to initialise the
// mock store before the factory runs.
const mockCookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

import { cookies } from "next/headers";
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
  isAdmin: true,
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
    expect(result!.isAdmin).toBe(testPayload.isAdmin);
  });

  it("verifySessionToken returns null for a garbage token", async () => {
    const result = await verifySessionToken("not.a.valid.jwt");
    expect(result).toBeNull();
  });

  it("verifySessionToken returns null for a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const otherSecret = new TextEncoder().encode("a-completely-different-secret");
    const token = await new SignJWT(testPayload as any)
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
    const token = await new SignJWT(testPayload as any)
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
    expect(result!.isAdmin).toBe(testPayload.isAdmin);
  });

  it("returns null when cookie contains an invalid token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "garbage.token.here" });
    const result = await getSession();
    expect(result).toBeNull();
  });
});
