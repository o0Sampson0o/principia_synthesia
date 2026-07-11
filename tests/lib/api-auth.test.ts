// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    get select() { return mockSelect; },
    get update() { return mockUpdate; },
  },
}));

import {
  generateApiToken,
  hashApiToken,
  getApiSession,
  requireApiSession,
  API_TOKEN_PREFIX,
} from "@/lib/api-auth";
import { NextResponse } from "next/server";

function setupTokenLookup(row: object | null) {
  const limitFn = vi.fn().mockResolvedValue(row ? [row] : []);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const joinFn = vi.fn().mockReturnValue({ where: whereFn });
  const fromFn = vi.fn().mockReturnValue({ innerJoin: joinFn });
  mockSelect.mockReturnValue({ from: fromFn });

  const updateWhere = vi.fn().mockReturnValue({ catch: vi.fn() });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  mockUpdate.mockReturnValue({ set: updateSet });
}

function requestWithToken(token?: string): Request {
  return new Request("http://localhost/api/v1/me", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const USER_ROW = {
  tokenId: 1,
  expiresAt: null,
  lastUsedAt: new Date(),
  userId: 10,
  email: "a@b.c",
  publisherSlug: "alice",
  isRootAdmin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateApiToken", () => {
  it("produces a prefixed raw token, its sha256 hash, and a display prefix", () => {
    const { raw, hash, prefix } = generateApiToken();
    expect(raw.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(hash).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(prefix).toBe(raw.slice(0, 12));
    expect(raw.length).toBeGreaterThan(40);
  });

  it("never produces the same token twice", () => {
    expect(generateApiToken().raw).not.toBe(generateApiToken().raw);
  });

  it("hashApiToken is deterministic", () => {
    expect(hashApiToken("pst_x")).toBe(hashApiToken("pst_x"));
  });
});

describe("getApiSession", () => {
  it("returns null without an Authorization header", async () => {
    setupTokenLookup(USER_ROW);
    expect(await getApiSession(requestWithToken())).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns null for a non-Bearer or non-pst_ token", async () => {
    setupTokenLookup(USER_ROW);
    const basic = new Request("http://localhost", { headers: { Authorization: "Basic abc" } });
    expect(await getApiSession(basic)).toBeNull();
    expect(await getApiSession(requestWithToken("wrong_prefix_token"))).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns a SessionPayload for a valid token", async () => {
    setupTokenLookup(USER_ROW);
    const session = await getApiSession(requestWithToken("pst_valid"));
    expect(session).toEqual({
      userId: 10,
      email: "a@b.c",
      userSlug: "alice",
      isRootAdmin: false,
    });
  });

  it("returns null for an unknown (or revoked) token", async () => {
    // revoked tokens are excluded by the query itself → empty result
    setupTokenLookup(null);
    expect(await getApiSession(requestWithToken("pst_unknown"))).toBeNull();
  });

  it("returns null for an expired token", async () => {
    setupTokenLookup({ ...USER_ROW, expiresAt: new Date(Date.now() - 1000) });
    expect(await getApiSession(requestWithToken("pst_expired"))).toBeNull();
  });

  it("refreshes lastUsedAt when it is stale", async () => {
    setupTokenLookup({ ...USER_ROW, lastUsedAt: new Date(Date.now() - 10 * 60 * 1000) });
    await getApiSession(requestWithToken("pst_valid"));
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("skips the lastUsedAt write when it is fresh", async () => {
    setupTokenLookup({ ...USER_ROW, lastUsedAt: new Date() });
    await getApiSession(requestWithToken("pst_valid"));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("requireApiSession", () => {
  it("returns a 401 NextResponse when unauthenticated", async () => {
    setupTokenLookup(null);
    const result = await requireApiSession(requestWithToken("pst_bad"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns the session when authenticated", async () => {
    setupTokenLookup(USER_ROW);
    const result = await requireApiSession(requestWithToken("pst_good"));
    expect(result).toMatchObject({ userId: 10 });
  });
});
