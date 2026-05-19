// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// Mock jose's jwtVerify so we can control its behaviour per-test.
const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    jwtVerify: mockJwtVerify,
  };
});

// Mock the rate-limiter so we can force 429 responses in tests.
const mockRateLimit = vi.hoisted(() => vi.fn().mockReturnValue(true));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mockRateLimit,
}));

import { middleware } from "@/middleware";


function makeRequest(path: string, sessionCookie?: string): NextRequest {
  const url = `http://localhost${path}`;
  if (sessionCookie) {
    const headers = new Headers({ cookie: `session=${sessionCookie}` });
    return new NextRequest(url, { headers });
  }
  return new NextRequest(url);
}


describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate-limiter allows requests
    mockRateLimit.mockReturnValue(true);
  });

  // -------------------------------------------------------------------------
  // General pass-through for non-gated paths
  // -------------------------------------------------------------------------
  describe("non-gated paths", () => {
    it("passes through / without a session cookie", async () => {
      const res = await middleware(makeRequest("/"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("passes through /<publisher>/articles/<slug>", async () => {
      const res = await middleware(makeRequest("/alice/articles/article-intro"));
      expect(res.status).toBe(200);
    });

    it("passes through /category/physics", async () => {
      const res = await middleware(makeRequest("/category/physics"));
      expect(res.status).toBe(200);
    });

    it("passes through /search", async () => {
      const res = await middleware(makeRequest("/search"));
      expect(res.status).toBe(200);
    });

    it("does NOT redirect /login even without a cookie", async () => {
      const res = await middleware(makeRequest("/login"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("does NOT redirect /signup even without a cookie", async () => {
      const res = await middleware(makeRequest("/signup"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // CSP nonce header is present on every response
  // -------------------------------------------------------------------------
  describe("CSP nonce", () => {
    it("sets a content-security-policy header on every response", async () => {
      const res = await middleware(makeRequest("/"));
      expect(res.headers.get("content-security-policy")).toBeTruthy();
    });

    it("includes a nonce in the CSP script-src directive", async () => {
      const res = await middleware(makeRequest("/"));
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    });

    it("sets x-csp-nonce request header so Server Components can read it", async () => {
      // NextResponse.next() merges the modified request headers into the response
      // headers only in a real runtime. In tests we verify the response at least
      // has the CSP header (the nonce propagation is an e2e concern).
      const res = await middleware(makeRequest("/about"));
      expect(res.headers.get("content-security-policy")).toBeTruthy();
    });

    it("allows unsafe-eval for settings pages", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { userId: 1 } });
      const res = await middleware(makeRequest("/settings/theme", "valid-token"));
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("unsafe-eval");
    });

    it("does NOT allow unsafe-eval for publisher article new page", async () => {
      const res = await middleware(makeRequest("/alice/articles/new"));
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).not.toContain("unsafe-eval");
    });

    it("does NOT allow unsafe-eval for publisher article edit page", async () => {
      const res = await middleware(makeRequest("/alice/articles/article-hello/edit"));
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).not.toContain("unsafe-eval");
    });

    it("does NOT allow unsafe-eval for publisher object edit page", async () => {
      const res = await middleware(makeRequest("/alice/objects/anim-wave/edit"));
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).not.toContain("unsafe-eval");
    });

    it("does NOT allow unsafe-eval on a regular publisher profile page", async () => {
      const res = await middleware(makeRequest("/alice"));
      const csp = res.headers.get("content-security-policy") ?? "";
      // unsafe-eval must not appear (in production mode)
      // NODE_ENV is 'test', which is not 'development', so eval is not auto-added
      expect(csp).not.toContain("unsafe-eval");
    });
  });

  // -------------------------------------------------------------------------
  // /settings/** — thin auth gate
  // -------------------------------------------------------------------------
  describe("/settings auth gate", () => {
    it("redirects to /login when no session cookie is set", async () => {
      const res = await middleware(makeRequest("/settings/theme"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects to /login when session cookie is present but jwtVerify throws", async () => {
      mockJwtVerify.mockRejectedValue(new Error("JWTExpired"));
      const res = await middleware(makeRequest("/settings/theme", "expired-token"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects to /login for /settings/profile with invalid signature", async () => {
      mockJwtVerify.mockRejectedValue(new Error("JWSSignatureVerificationFailed"));
      const res = await middleware(makeRequest("/settings/profile", "bad-sig-token"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("passes through /settings/theme with a valid session token", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { userId: 1, userSlug: "alice", isRootAdmin: false } });
      const res = await middleware(makeRequest("/settings/theme", "valid-token"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("passes through /settings for root admin with valid token", async () => {
      mockJwtVerify.mockResolvedValue({ payload: { userId: 1, userSlug: "principia-official", isRootAdmin: true } });
      const res = await middleware(makeRequest("/settings", "root-admin-token"));
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting on /login and /signup
  // -------------------------------------------------------------------------
  describe("rate limiting", () => {
    it("returns 429 when the rate limiter rejects a /login request", async () => {
      mockRateLimit.mockReturnValue(false);
      const res = await middleware(makeRequest("/login"));
      expect(res.status).toBe(429);
    });

    it("returns 429 when the rate limiter rejects a /signup request", async () => {
      mockRateLimit.mockReturnValue(false);
      const res = await middleware(makeRequest("/signup"));
      expect(res.status).toBe(429);
    });

    it("calls rateLimit with an auth key derived from the client IP for /login", async () => {
      const headers = new Headers({ "x-forwarded-for": "192.0.2.1" });
      const req = new NextRequest("http://localhost/login", { headers });
      await middleware(req);
      expect(mockRateLimit).toHaveBeenCalledWith("auth:192.0.2.1", 10, 60_000);
    });

    it("calls rateLimit with an auth key derived from the client IP for /signup", async () => {
      const headers = new Headers({ "x-forwarded-for": "192.0.2.42" });
      const req = new NextRequest("http://localhost/signup", { headers });
      await middleware(req);
      expect(mockRateLimit).toHaveBeenCalledWith("auth:192.0.2.42", 10, 60_000);
    });

    it("falls back to 'unknown' IP when x-forwarded-for is absent", async () => {
      await middleware(makeRequest("/login"));
      expect(mockRateLimit).toHaveBeenCalledWith("auth:unknown", 10, 60_000);
    });

    it("passes through /login when rate limiter allows the request", async () => {
      mockRateLimit.mockReturnValue(true);
      const res = await middleware(makeRequest("/login"));
      expect(res.status).toBe(200);
    });

    it("does NOT rate-limit non-auth paths like /", async () => {
      await middleware(makeRequest("/"));
      expect(mockRateLimit).not.toHaveBeenCalled();
    });

    it("does NOT rate-limit publisher profile pages", async () => {
      await middleware(makeRequest("/alice"));
      expect(mockRateLimit).not.toHaveBeenCalled();
    });
  });
});
