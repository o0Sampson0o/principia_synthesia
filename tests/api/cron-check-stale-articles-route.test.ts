// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockExecute = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    execute: mockExecute,
    select: mockSelect,
  },
}));

// ─── notifications mock ───────────────────────────────────────────────────────

const mockNotifyDigest = vi.hoisted(() => vi.fn());
const mockResolveArticleAuthors = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  notifyDigest: mockNotifyDigest,
  resolveArticleAuthors: mockResolveArticleAuthors,
}));

// ─── Drizzle-orm pass-through ─────────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    sql: actual.sql,
    inArray: vi.fn((...args) => actual.inArray(...(args as Parameters<typeof actual.inArray>))),
  };
});

// ─── Process env setup ────────────────────────────────────────────────────────

process.env.CRON_SECRET = "test-secret";

import { GET } from "@/app/api/admin/cron/check-stale-articles/route";

describe("GET /api/admin/cron/check-stale-articles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    const req = new Request("http://localhost/api/admin/cron/check-stale-articles");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong bearer token", async () => {
    const req = new Request("http://localhost/api/admin/cron/check-stale-articles", {
      headers: { authorization: "Bearer wrong-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("notifies owners of stale articles", async () => {
    // db.execute returns stale rows
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 1,
          slug: "article-stale",
          title: "Stale Article",
          owner_type: "user",
          owner_id: 42,
          publisher_slug: "alice",
        },
      ],
    });

    // resolveArticleAuthors: user owner → returns [owner_id]
    mockResolveArticleAuthors.mockResolvedValue([42]);

    mockNotifyDigest.mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/admin/cron/check-stale-articles", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checked).toBe(1);
    expect(body.notified).toBe(1);
    expect(mockNotifyDigest).toHaveBeenCalledWith(
      42,
      "stale_articles_digest",
      expect.objectContaining({
        count: 1,
        articles: expect.arrayContaining([
          expect.objectContaining({ articleId: 1, slug: "article-stale" }),
        ]),
      })
    );
  });

  it("returns checked:0 when no stale articles", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const req = new Request("http://localhost/api/admin/cron/check-stale-articles", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(body.checked).toBe(0);
    expect(body.notified).toBe(0);
    expect(mockNotifyDigest).not.toHaveBeenCalled();
  });
});
