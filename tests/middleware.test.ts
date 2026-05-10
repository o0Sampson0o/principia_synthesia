// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

// We need to mock jose's jwtVerify before importing middleware.
// Use vi.hoisted to ensure the mock factory can reference variables defined here.
const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    jwtVerify: mockJwtVerify,
  };
});

import { middleware } from "@/middleware";

// Test secret matches the one used in middleware
const TEST_SECRET = "dev-secret-change-in-production";

function makeRequest(path: string, sessionCookie?: string): NextRequest {
  const url = `http://localhost${path}`;
  const req = new NextRequest(url);
  if (sessionCookie) {
    // NextRequest doesn't let us set cookies directly; use the headers approach
    const headers = new Headers({ cookie: `session=${sessionCookie}` });
    return new NextRequest(url, { headers });
  }
  return req;
}

/** Create a real JWT for testing. */
async function makeToken(payload: Record<string, unknown>, secret = TEST_SECRET): Promise<string> {
  const enc = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(enc);
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("non-admin paths", () => {
    it("passes through requests to /", async () => {
      const req = makeRequest("/");
      const res = await middleware(req);
      // NextResponse.next() doesn't redirect; status 200
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("passes through requests to /about", async () => {
      const req = makeRequest("/about");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("passes through requests to /some-article", async () => {
      const req = makeRequest("/some-article");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("passes through requests to /login", async () => {
      const req = makeRequest("/login");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });

  describe("/admin path with no cookie", () => {
    it("redirects to /login when no session cookie is present", async () => {
      // For the no-cookie test, jwtVerify shouldn't even be called
      const req = makeRequest("/admin");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects to /login for /admin/articles/new with no cookie", async () => {
      const req = makeRequest("/admin/articles/new");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });
  });

  describe("/admin path with valid admin token", () => {
    it("passes through when session has isAdmin: true", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { isAdmin: true, userId: 1 } });
      const req = makeRequest("/admin", "valid-token");
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("passes through for /admin/curriculum with admin token", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { isAdmin: true } });
      const req = makeRequest("/admin/curriculum", "admin-token");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });

  describe("/admin path with valid non-admin token", () => {
    it("redirects to / when isAdmin is false", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { isAdmin: false, userId: 2 } });
      const req = makeRequest("/admin", "non-admin-token");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toMatch(/\/$/);
    });

    it("redirects to / when isAdmin is missing from payload", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { userId: 3 } });
      const req = makeRequest("/admin", "no-admin-field-token");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      // Should redirect to root (not /login)
      expect(location).toMatch(/\/$/);
    });
  });

  describe("/admin path with invalid/expired token", () => {
    it("redirects to /login when jwtVerify throws (invalid token)", async () => {
      mockJwtVerify.mockRejectedValue(new Error("JWTExpired"));
      const req = makeRequest("/admin", "expired-or-invalid-token");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects to /login when jwtVerify throws for /admin/settings", async () => {
      mockJwtVerify.mockRejectedValue(new Error("JWSSignatureVerificationFailed"));
      const req = makeRequest("/admin/settings", "bad-signature-token");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });
  });
});
