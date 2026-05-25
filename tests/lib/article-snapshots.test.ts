// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsertValuesOnConflict = vi.hoisted(() => vi.fn());
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
    like: vi.fn((...args) => actual.like(...(args as Parameters<typeof actual.like>))),
  };
});

import {
  createSnapshotIfPublished,
  getSnapshotByShortHash,
} from "@/lib/article-snapshots";
import type { ArticleMetadataShape } from "@/db/schema";

const publishedMetadata: ArticleMetadataShape = {
  status: "published",
  tags: [],
  description: "",
  canvas: null,
};

const draftMetadata: ArticleMetadataShape = {
  status: "draft",
  tags: [],
  description: "",
  canvas: null,
};

describe("createSnapshotIfPublished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValuesOnConflict.mockResolvedValue([]);
    mockInsertValues.mockReturnValue({ onConflictDoNothing: mockInsertValuesOnConflict });
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  it("returns created:false when status is not published", async () => {
    const result = await createSnapshotIfPublished(1, {
      title: "Test",
      summary: null,
      content: "# Hello",
      metadata: draftMetadata,
    });

    expect(result).toEqual({ created: false, shortHash: null });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts and returns shortHash (7 chars) when published", async () => {
    const result = await createSnapshotIfPublished(1, {
      title: "Test",
      summary: null,
      content: "# Hello",
      metadata: publishedMetadata,
    });

    expect(result.created).toBe(true);
    expect(result.shortHash).toHaveLength(7);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("uses onConflictDoNothing for idempotent deduplification", async () => {
    await createSnapshotIfPublished(1, {
      title: "Test",
      summary: null,
      content: "# Same content",
      metadata: publishedMetadata,
    });

    expect(mockInsertValuesOnConflict).toHaveBeenCalledTimes(1);
  });
});

describe("getSnapshotByShortHash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no snapshots match", async () => {
    mockSelectFromWhere.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    const result = await getSnapshotByShortHash(1, "abc1234");
    expect(result).toBeNull();
  });

  it("returns null when multiple snapshots match (ambiguous prefix)", async () => {
    const rows = [
      { id: 1, shortHash: "abc1234", title: "A", summary: null, content: "c1", metadata: publishedMetadata, publishedAt: new Date() },
      { id: 2, shortHash: "abc5678", title: "B", summary: null, content: "c2", metadata: publishedMetadata, publishedAt: new Date() },
    ];
    mockSelectFromWhere.mockResolvedValue(rows);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    const result = await getSnapshotByShortHash(1, "abc");
    expect(result).toBeNull();
  });

  it("returns the matching snapshot when exactly one row matches", async () => {
    const publishedAt = new Date("2026-01-15");
    const row = {
      id: 1,
      shortHash: "abc1234",
      title: "Test Article",
      summary: "A summary",
      content: "# Content",
      metadata: publishedMetadata,
      publishedAt,
    };
    mockSelectFromWhere.mockResolvedValue([row]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    const result = await getSnapshotByShortHash(1, "abc1234");
    expect(result).not.toBeNull();
    expect(result?.shortHash).toBe("abc1234");
    expect(result?.title).toBe("Test Article");
    expect(result?.publishedAt).toEqual(publishedAt);
  });
});
