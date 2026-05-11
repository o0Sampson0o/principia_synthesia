// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock rateLimit
const mockRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mockRateLimit,
}));

import { middleware } from "@/middleware";

function makeRequest(path: string): NextRequest {
  const url = `http://localhost${path}`;
  return new NextRequest(url);
}

describe("middleware CSP", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue(true);
  });

  afterEach(() => {
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  it("includes 'unsafe-eval' in script-src when NODE_ENV is development", async () => {
    // @ts-ignore
    process.env.NODE_ENV = "development";
    const req = makeRequest("/");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("does NOT include 'unsafe-eval' in script-src when NODE_ENV is production", async () => {
    // @ts-ignore
    process.env.NODE_ENV = "production";
    const req = makeRequest("/");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("does NOT include 'unsafe-eval' in script-src when NODE_ENV is test", async () => {
    // @ts-ignore
    process.env.NODE_ENV = "test";
    const req = makeRequest("/");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
