// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
    isNull: vi.fn((...args) => actual.isNull(...(args as Parameters<typeof actual.isNull>))),
  };
});

import { notify, notifyWithDedupe, type StaleArticlesDigestPayload } from "@/lib/notifications";

describe("notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  it("inserts a notification row", async () => {
    const payload: StaleArticlesDigestPayload = {
      articles: [{ articleId: 42, slug: "article-test", publisherSlug: "alice", title: "Test Article" }],
      count: 1,
    };

    await notify(1, "stale_articles_digest", payload);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        type: "stale_articles_digest",
        payload,
      })
    );
  });
});

describe("notifyWithDedupe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  const payload: StaleArticlesDigestPayload = {
    articles: [{ articleId: 99, slug: "article-stale", publisherSlug: "bob", title: "Stale Article" }],
    count: 1,
  };

  it("inserts when no existing unread notification matches the dedupe key", async () => {
    mockSelectFromWhere.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    await notifyWithDedupe(
      1,
      "stale_articles_digest",
      payload,
      (p) => `digest:${(p as StaleArticlesDigestPayload).count}`
    );

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("skips insert when matching unread notification already exists", async () => {
    const existingRow = {
      id: 5,
      payload: { articles: [{ articleId: 99, slug: "article-stale", publisherSlug: "bob", title: "Stale Article" }], count: 1 },
    };
    mockSelectFromWhere.mockResolvedValue([existingRow]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    await notifyWithDedupe(
      1,
      "stale_articles_digest",
      payload,
      (p) => `digest:${(p as StaleArticlesDigestPayload).count}`
    );

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
