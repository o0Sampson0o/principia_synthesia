// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import after potential vi.useFakeTimers setup — the module uses Date.now()
// internally with a module-level Map, so we need a fresh module per test where
// we want isolated state. We accomplish isolation by clearing the buckets via
// time manipulation (advancing past the window) or __resetForTests().

import { rateLimit, __resetForTests } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Start at a fixed epoch so bucket keys don't collide across tests.
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true on the first call within the limit", () => {
    const result = rateLimit("test-first-call", 5, 60_000);
    expect(result).toBe(true);
  });

  it("allows exactly limit requests before rejection", () => {
    const key = "test-exact-limit";
    const limit = 3;
    const results: boolean[] = [];
    for (let i = 0; i < limit; i++) {
      results.push(rateLimit(key, limit, 60_000));
    }
    // All limit requests should be allowed
    expect(results.every((r) => r === true)).toBe(true);
    // The next one (limit+1) should be rejected
    expect(rateLimit(key, limit, 60_000)).toBe(false);
  });

  it("returns false when the limit has been exceeded", () => {
    const key = "test-exceeded";
    const limit = 2;
    rateLimit(key, limit, 60_000); // 1
    rateLimit(key, limit, 60_000); // 2 — bucket now at 0
    const result = rateLimit(key, limit, 60_000); // should be rejected
    expect(result).toBe(false);
  });

  it("resets tokens after the window expires", () => {
    const key = "test-window-reset";
    const limit = 2;
    const windowMs = 60_000;

    rateLimit(key, limit, windowMs); // 1
    rateLimit(key, limit, windowMs); // 2 — exhausted
    expect(rateLimit(key, limit, windowMs)).toBe(false); // 3 — rejected

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Tokens should reset — first call in new window is allowed
    expect(rateLimit(key, limit, windowMs)).toBe(true);
  });

  it("different keys are independent", () => {
    const limit = 1;
    const windowMs = 60_000;

    rateLimit("key-a", limit, windowMs); // exhausts key-a
    expect(rateLimit("key-a", limit, windowMs)).toBe(false); // key-a rejected

    // key-b has its own fresh bucket
    expect(rateLimit("key-b", limit, windowMs)).toBe(true);
  });

  it("a single request is allowed with limit=1", () => {
    const key = "test-limit-one";
    expect(rateLimit(key, 1, 60_000)).toBe(true);
    expect(rateLimit(key, 1, 60_000)).toBe(false);
  });

  it("counts down tokens correctly across sequential calls", () => {
    const key = "test-countdown";
    const limit = 4;
    const windowMs = 60_000;

    // 4 allowed, then rejected
    expect(rateLimit(key, limit, windowMs)).toBe(true);  // tokens left: 3
    expect(rateLimit(key, limit, windowMs)).toBe(true);  // tokens left: 2
    expect(rateLimit(key, limit, windowMs)).toBe(true);  // tokens left: 1
    expect(rateLimit(key, limit, windowMs)).toBe(true);  // tokens left: 0
    expect(rateLimit(key, limit, windowMs)).toBe(false); // rejected
    expect(rateLimit(key, limit, windowMs)).toBe(false); // still rejected
  });
});

describe("__resetForTests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetForTests();
  });

  it("clears all buckets so previously-exhausted keys are allowed again", () => {
    const key = "test-reset-helper";
    rateLimit(key, 1, 60_000);
    expect(rateLimit(key, 1, 60_000)).toBe(false);
    __resetForTests();
    expect(rateLimit(key, 1, 60_000)).toBe(true);
  });

  it("verify action: rejects on the 4th call within the same window", () => {
    const userId = 999;
    const key = `verify:${userId}`;
    expect(rateLimit(key, 3, 60 * 60 * 1000)).toBe(true);
    expect(rateLimit(key, 3, 60 * 60 * 1000)).toBe(true);
    expect(rateLimit(key, 3, 60 * 60 * 1000)).toBe(true);
    expect(rateLimit(key, 3, 60 * 60 * 1000)).toBe(false);
  });

  it("invite action: rejects on the 6th call within the same window", () => {
    const orgId = 42;
    const key = `invite:${orgId}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60 * 60 * 1000)).toBe(true);
    }
    expect(rateLimit(key, 5, 60 * 60 * 1000)).toBe(false);
  });
});
