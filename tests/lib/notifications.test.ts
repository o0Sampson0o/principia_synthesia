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

import { notify, notifyWithDedupe, type StaleArticlePayload } from "@/lib/notifications";

describe("notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  it("inserts a notification row", async () => {
    const payload: StaleArticlePayload = {
      articleId: 42,
      slug: "article-test",
      publisherSlug: "alice",
      title: "Test Article",
    };

    await notify(1, "stale_article", payload);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        type: "stale_article",
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

  const payload: StaleArticlePayload = {
    articleId: 99,
    slug: "article-stale",
    publisherSlug: "bob",
    title: "Stale Article",
  };

  it("inserts when no existing unread notification matches the dedupe key", async () => {
    // Select returns no existing notifications
    // db.select().from().where() resolves directly (Drizzle promise)
    mockSelectFromWhere.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    await notifyWithDedupe(
      1,
      "stale_article",
      payload,
      (p) => `articleId:${(p as StaleArticlePayload).articleId}`
    );

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("skips insert when matching unread notification already exists", async () => {
    // Select returns an existing unread notification with same dedupe key
    const existingRow = {
      id: 5,
      payload: { articleId: 99, slug: "article-stale", publisherSlug: "bob", title: "Stale Article" },
    };
    mockSelectFromWhere.mockResolvedValue([existingRow]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    await notifyWithDedupe(
      1,
      "stale_article",
      payload,
      (p) => `articleId:${(p as StaleArticlePayload).articleId}`
    );

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
