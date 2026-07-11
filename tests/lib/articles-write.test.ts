// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdateReturning = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    get select() { return mockSelect; },
    get insert() { return mockInsert; },
    get update() { return mockUpdate; },
  },
}));

const mockSetContentTags = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content-tags", () => ({ setContentTags: mockSetContentTags }));

const mockCreateSnapshot = vi.hoisted(() => vi.fn());
vi.mock("@/lib/article-snapshots", () => ({ createSnapshotIfPublished: mockCreateSnapshot }));

const mockSyncCitations = vi.hoisted(() => vi.fn());
vi.mock("@/lib/citations-sync", () => ({ syncArticleCitations: mockSyncCitations }));

const mockNotify = vi.hoisted(() => vi.fn());
const mockResolveAuthors = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications", () => ({
  notify: mockNotify,
  resolveArticleAuthors: mockResolveAuthors,
}));

import { setupSelectQueue } from "../helpers/drizzle-mocks";
import {
  createArticleCore,
  updateArticleCore,
  deleteArticleCore,
  computeContentHash,
  ArticleConflictError,
  ArticleNotFoundError,
} from "@/lib/articles-write";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SESSION = { userId: 10, email: "a@b.c", userSlug: "alice", isRootAdmin: false };

const PUBLISHED_CONTENT = `---
status: published
tags: ["physics"]
description: "d"
canvas: null
---

# Title
`;

const CURRENT_ROW = {
  id: 5,
  slug: "article-x",
  title: "Old title",
  summary: "old",
  content: "old content",
  ownerType: "user",
  ownerId: 10,
  metadata: { status: "published", tags: [], description: "", canvas: null },
  isInternal: false,
  parentBookId: null,
  updatedAt: new Date("2026-01-01"),
  draftContent: null,
  draftSavedAt: null,
  deletedAt: null,
};

function setupInsert(returned: object) {
  mockInsertReturning.mockResolvedValue([returned]);
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning, });
  // revisions insert has no .returning() — values() resolves directly too
  mockInsertValues.mockImplementation(() => {
    const p = Promise.resolve([returned]) as Promise<unknown> & { returning: typeof mockInsertReturning };
    p.returning = mockInsertReturning;
    return p;
  });
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

function setupUpdate() {
  mockUpdateReturning.mockResolvedValue([{ id: 5 }]);
  mockUpdateWhere.mockImplementation(() => {
    const p = Promise.resolve({ rowCount: 1 }) as Promise<unknown> & { returning: typeof mockUpdateReturning };
    p.returning = mockUpdateReturning;
    return p;
  });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncCitations.mockResolvedValue({ added: [], removed: [] });
  mockCreateSnapshot.mockResolvedValue({ created: true, shortHash: "abc" });
  mockSetContentTags.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeContentHash", () => {
  it("matches the snapshot hash recipe (sha256 hex of exact string)", () => {
    const expected = createHash("sha256").update("hello").digest("hex");
    expect(computeContentHash("hello")).toBe(expected);
  });
});

describe("createArticleCore", () => {
  it("inserts, tags, snapshots, and returns the content hash", async () => {
    setupInsert({ id: 99, updatedAt: new Date("2026-07-01") });

    const result = await createArticleCore({
      actor: SESSION,
      ownerType: "user",
      ownerId: 10,
      publisherSlug: "alice",
      slug: "article-new",
      title: "New",
      content: PUBLISHED_CONTENT,
      extraCategorySlugs: ["extra"],
    });

    expect(result.id).toBe(99);
    expect(result.contentHash).toBe(computeContentHash(PUBLISHED_CONTENT));
    // frontmatter tags merged with extra categories, deduped
    expect(mockSetContentTags).toHaveBeenCalledWith("article", 99, ["extra", "physics"], 10);
    expect(mockCreateSnapshot).toHaveBeenCalledWith(99, expect.objectContaining({ title: "New" }));
    expect(mockSyncCitations).toHaveBeenCalledWith(99, PUBLISHED_CONTENT);
    // lastVerifiedAt set because status is published
    expect(mockInsertValues.mock.calls[0][0]).toMatchObject({ lastVerifiedAt: expect.any(Date) });
  });
});

describe("updateArticleCore", () => {
  it("throws ArticleConflictError before any write when the base hash mismatches", async () => {
    setupSelectQueue(mockSelect, [{ result: [CURRENT_ROW], withLimit: true }]);
    setupInsert({ id: 5 });
    setupUpdate();

    await expect(
      updateArticleCore({
        actor: SESSION,
        ownerType: "user",
        ownerId: 10,
        publisherSlug: "alice",
        id: 5,
        slug: "article-x",
        title: "T",
        content: PUBLISHED_CONTENT,
        expectedBaseHash: "not-the-right-hash",
      })
    ).rejects.toThrow(ArticleConflictError);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("throws ArticleNotFoundError when a precondition is given and the article is missing", async () => {
    setupSelectQueue(mockSelect, [{ result: [], withLimit: true }]);

    await expect(
      updateArticleCore({
        actor: SESSION,
        ownerType: "user",
        ownerId: 10,
        publisherSlug: "alice",
        id: 999,
        slug: "article-x",
        title: "T",
        content: PUBLISHED_CONTENT,
        expectedBaseHash: computeContentHash("old content"),
      })
    ).rejects.toThrow(ArticleNotFoundError);
  });

  it("accepts a matching base hash, inserts a revision, and clears the draft", async () => {
    setupSelectQueue(mockSelect, [{ result: [CURRENT_ROW], withLimit: true }]);
    setupInsert({ id: 5 });
    setupUpdate();

    const result = await updateArticleCore({
      actor: SESSION,
      ownerType: "user",
      ownerId: 10,
      publisherSlug: "alice",
      id: 5,
      slug: "article-x",
      title: "T",
      content: PUBLISHED_CONTENT,
      editNote: "Synced via ps-sync",
      expectedBaseHash: computeContentHash("old content"),
    });

    // Revision preserves the prior content
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 5, content: "old content", editNote: "Synced via ps-sync" })
    );
    // Update clears draft and bumps lastVerifiedAt (published)
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        draftContent: null,
        draftSavedAt: null,
        lastVerifiedAt: expect.any(Date),
        content: PUBLISHED_CONTENT,
      })
    );
    expect(result.contentHash).toBe(computeContentHash(PUBLISHED_CONTENT));
    expect(result.current).toEqual(CURRENT_ROW);
  });

  it("does not set lastVerifiedAt for a draft-status save", async () => {
    setupSelectQueue(mockSelect, [{ result: [CURRENT_ROW], withLimit: true }]);
    setupInsert({ id: 5 });
    setupUpdate();

    const draftContent = PUBLISHED_CONTENT.replace("status: published", "status: draft");
    await updateArticleCore({
      actor: SESSION,
      ownerType: "user",
      ownerId: 10,
      publisherSlug: "alice",
      id: 5,
      slug: "article-x",
      title: "T",
      content: draftContent,
    });

    expect(mockUpdateSet.mock.calls[0][0]).not.toHaveProperty("lastVerifiedAt");
  });

  it("notifies newly cited authors", async () => {
    setupSelectQueue(mockSelect, [
      { result: [CURRENT_ROW], withLimit: true }, // current article
      { result: [{ ownerType: "user", ownerId: 42, slug: "article-cited" }], withLimit: true }, // cited row
    ]);
    setupInsert({ id: 5 });
    setupUpdate();
    mockSyncCitations.mockResolvedValue({ added: [77], removed: [] });
    mockResolveAuthors.mockResolvedValue([42]);
    mockNotify.mockResolvedValue(undefined);

    await updateArticleCore({
      actor: SESSION,
      ownerType: "user",
      ownerId: 10,
      publisherSlug: "alice",
      id: 5,
      slug: "article-x",
      title: "T",
      content: PUBLISHED_CONTENT,
    });

    expect(mockNotify).toHaveBeenCalledWith(
      42,
      "article_cited",
      expect.objectContaining({ citingArticleId: 5, citedSlug: "article-cited" })
    );
  });
});

describe("deleteArticleCore", () => {
  it("soft-deletes and reports whether a row matched", async () => {
    setupUpdate();
    const result = await deleteArticleCore({ ownerType: "user", ownerId: 10, id: 5 });
    expect(result.found).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });
  });

  it("rejects a stale precondition with ArticleConflictError", async () => {
    setupSelectQueue(mockSelect, [
      { result: [{ content: "current content", updatedAt: new Date() }], withLimit: true },
    ]);
    setupUpdate();

    await expect(
      deleteArticleCore({
        ownerType: "user",
        ownerId: 10,
        id: 5,
        expectedBaseHash: computeContentHash("something else"),
      })
    ).rejects.toThrow(ArticleConflictError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
