// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockInsertOnConflict = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

const mockSelectFromWhereLimit = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFromInnerJoin = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  },
}));

// ─── Snapshot helper mock ─────────────────────────────────────────────────────

const mockCreateSnapshotIfPublished = vi.hoisted(() => vi.fn());

vi.mock("@/lib/article-snapshots", () => ({
  createSnapshotIfPublished: mockCreateSnapshotIfPublished,
}));

// ─── Citations sync mock ──────────────────────────────────────────────────────

const mockSyncArticleCitations = vi.hoisted(() => vi.fn());

vi.mock("@/lib/citations-sync", () => ({
  syncArticleCitations: mockSyncArticleCitations,
}));

// ─── Content tags mock ────────────────────────────────────────────────────────

vi.mock("@/lib/content-tags", () => ({
  setContentTags: vi.fn().mockResolvedValue(undefined),
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockRequireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireSession: mockRequireSession,
}));

// ─── Roles mock ───────────────────────────────────────────────────────────────

const mockCanEditContent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/roles", () => ({
  canEditContent: mockCanEditContent,
}));

// ─── Publisher mock ───────────────────────────────────────────────────────────

const mockResolvePublisher = vi.hoisted(() => vi.fn());

vi.mock("@/lib/publisher", () => ({
  resolvePublisher: mockResolvePublisher,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ─── next/navigation mock ─────────────────────────────────────────────────────

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

// ─── Drizzle-orm pass-through ─────────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
    inArray: vi.fn((...args) => actual.inArray(...(args as Parameters<typeof actual.inArray>))),
  };
});

import { updateArticle } from "@/app/[publisher]/articles/actions";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

function setupPublisher() {
  mockRequireSession.mockResolvedValue({
    userId: 10,
    email: "a@example.com",
    userSlug: "alice",
    isRootAdmin: false,
  });
  mockResolvePublisher.mockResolvedValue({
    kind: "user",
    userId: 10,
    orgId: null,
    slug: "alice",
    displayName: "Alice",
  });
  mockCanEditContent.mockResolvedValue(true);
}

describe("updateArticle snapshot behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisher();

    // select returns current article
    mockSelectFromWhereLimit.mockResolvedValue([{
      id: 5,
      content: "---\nstatus: draft\n---\n# Old",
      slug: "article-test",
      title: "Old Title",
      summary: null,
      isInternal: false,
      parentBookId: null,
    }]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    // innerJoin chain for categories
    mockSelectFromInnerJoin.mockReturnValue({ where: mockSelectFromWhere });
    mockSelectFrom.mockImplementation(() => ({
      where: mockSelectFromWhere,
      innerJoin: mockSelectFromInnerJoin,
    }));
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // insert chain (categories + revisions)
    mockInsertReturning.mockResolvedValue([{ id: 5, slug: "article-test" }]);
    mockInsertOnConflict.mockResolvedValue([]);
    mockInsertValues.mockReturnValue({
      returning: mockInsertReturning,
      onConflictDoNothing: mockInsertOnConflict,
    });
    mockInsert.mockReturnValue({ values: mockInsertValues });

    // update chain
    mockUpdateWhere.mockResolvedValue({ rowCount: 1 });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    // delete chain (categories cleanup)
    mockDeleteWhere.mockResolvedValue({ rowCount: 0 });
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    // redirect throws as expected
    mockRedirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });

    mockCreateSnapshotIfPublished.mockResolvedValue({ created: true, shortHash: "abc1234" });
    mockSyncArticleCitations.mockResolvedValue({ added: [], removed: [] });
  });

  it("calls createSnapshotIfPublished when article is published", async () => {
    const fd = makeFormData({
      id: "5",
      title: "Updated Title",
      slug: "article-test",
      content: "---\nstatus: published\n---\n# Hello",
    });

    await expect(updateArticle("alice", null, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockCreateSnapshotIfPublished).toHaveBeenCalledTimes(1);
    expect(mockCreateSnapshotIfPublished).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ metadata: expect.objectContaining({ status: "published" }) })
    );
  });

  it("still calls createSnapshotIfPublished when status is draft (helper handles the skip)", async () => {
    const fd = makeFormData({
      id: "5",
      title: "Draft Title",
      slug: "article-test",
      content: "---\nstatus: draft\n---\n# Hello",
    });

    mockCreateSnapshotIfPublished.mockResolvedValue({ created: false, shortHash: null });

    await expect(updateArticle("alice", null, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockCreateSnapshotIfPublished).toHaveBeenCalledTimes(1);
    expect(mockCreateSnapshotIfPublished).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ metadata: expect.objectContaining({ status: "draft" }) })
    );
  });
});
