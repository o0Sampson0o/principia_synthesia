// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockSelect = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    transaction: mockTransaction,
  },
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

// ─── Access mock ──────────────────────────────────────────────────────────────

const mockCanView = vi.hoisted(() => vi.fn());

vi.mock("@/lib/access", () => ({
  canView: mockCanView,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// ─── next/navigation mock ─────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// ─── Drizzle-orm — pass through eq/and/or so real SQL is constructed ──────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
    or: vi.fn((...args) => actual.or(...(args as Parameters<typeof actual.or>))),
  };
});

import {
  addExternalArticle,
  saveBookOutline,
} from "@/app/[publisher]/books/actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

/**
 * Build a chainable mock for db.select().from().where?().innerJoin?().where().limit()
 * that resolves to `rows`.
 *
 * Supports the following chains used by the actions:
 *   .from().where().limit()                       — simple lookup
 *   .from().innerJoin().where().limit()            — conflict lookup
 */
function chainResolving(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  return { from };
}

/** Default Publisher A session / publisher record */
function setupPublisherA() {
  mockRequireSession.mockResolvedValue({
    userId: 10,
    email: "a@example.com",
    userSlug: "publisher-a",
    isRootAdmin: false,
  });
  mockResolvePublisher.mockResolvedValue({
    kind: "user",
    userId: 10,
    orgId: null,
    slug: "publisher-a",
    displayName: "Publisher A",
  });
  mockCanEditContent.mockResolvedValue(true);
}

/** Publisher B record — used as target publisher */
const publisherB = {
  kind: "user" as const,
  userId: 20,
  orgId: null,
  slug: "publisher-b",
  displayName: "Publisher B",
};

// ─── addExternalArticle ───────────────────────────────────────────────────────

describe("addExternalArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    mockCanView.mockResolvedValue(true);
  });

  it("happy path — inserts curriculum entry and revalidates both paths", async () => {
    // assertEditRights → resolvePublisher("publisher-a") already set in setupPublisherA
    // addExternalArticle then calls resolvePublisher("publisher-b")
    mockResolvePublisher
      .mockResolvedValueOnce({
        kind: "user",
        userId: 10,
        orgId: null,
        slug: "publisher-a",
        displayName: "Publisher A",
      })
      .mockResolvedValueOnce(publisherB);

    // select calls: book ownership → article lookup → slug conflict
    mockSelect
      .mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }])) // book ownership
      .mockReturnValueOnce(chainResolving([{ id: 7 }]))                  // article found
      .mockReturnValueOnce(chainResolving([]));                           // no slug conflict

    // insert chain
    mockInsertValues.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "article-foo",
      position: "0",
    });

    await addExternalArticle("publisher-a", fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: 5, articleId: 7, position: 0 })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/publisher-a/books/book-x");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/publisher-a/books/book-x/edit");
  });

  it("rejects when caller is not an editor of the host publisher", async () => {
    mockCanEditContent.mockResolvedValue(false);

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "article-foo",
      position: "0",
    });

    await expect(addExternalArticle("publisher-a", fd)).rejects.toThrow("Forbidden");
  });

  it("rejects when targetPublisher equals the host publisher", async () => {
    // book ownership check happens before same-publisher guard
    mockSelect.mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }]));

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-a",
      articleSlug: "article-foo",
      position: "0",
    });

    await expect(addExternalArticle("publisher-a", fd)).rejects.toThrow(
      /same-publisher section picker/
    );
  });

  it("rejects when target publisher does not exist", async () => {
    // assertEditRights calls resolvePublisher once → then addExternalArticle calls it again for target
    mockResolvePublisher
      .mockResolvedValueOnce({
        kind: "user",
        userId: 10,
        orgId: null,
        slug: "publisher-a",
        displayName: "Publisher A",
      })
      .mockResolvedValueOnce(null);

    // book ownership check happens before target publisher resolution
    mockSelect.mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }]));

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "article-foo",
      position: "0",
    });

    await expect(addExternalArticle("publisher-a", fd)).rejects.toThrow(
      "Target publisher not found"
    );
  });

  it("rejects when article does not exist (empty result)", async () => {
    mockResolvePublisher
      .mockResolvedValueOnce({
        kind: "user",
        userId: 10,
        orgId: null,
        slug: "publisher-a",
        displayName: "Publisher A",
      })
      .mockResolvedValueOnce(publisherB);

    // book ownership check → then article lookup returns empty
    mockSelect
      .mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }])) // book ownership
      .mockReturnValueOnce(chainResolving([]));                           // article not found

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "article-foo",
      position: "0",
    });

    await expect(addExternalArticle("publisher-a", fd)).rejects.toThrow("Article not found");
  });

  it("rejects when canView returns false (visibility gate)", async () => {
    mockResolvePublisher
      .mockResolvedValueOnce({
        kind: "user",
        userId: 10,
        orgId: null,
        slug: "publisher-a",
        displayName: "Publisher A",
      })
      .mockResolvedValueOnce(publisherB);

    // book ownership check → article found, but canView returns false
    mockSelect
      .mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }])) // book ownership
      .mockReturnValueOnce(chainResolving([{ id: 7 }]));                  // article found
    mockCanView.mockResolvedValue(false);

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "article-foo",
      position: "0",
    });

    await expect(addExternalArticle("publisher-a", fd)).rejects.toThrow(
      "You do not have access to that article"
    );
  });

  it("rejects on slug conflict", async () => {
    mockResolvePublisher
      .mockResolvedValueOnce({
        kind: "user",
        userId: 10,
        orgId: null,
        slug: "publisher-a",
        displayName: "Publisher A",
      })
      .mockResolvedValueOnce(publisherB);

    // book ownership → article found → conflict found
    mockSelect
      .mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }])) // book ownership
      .mockReturnValueOnce(chainResolving([{ id: 7 }]))                  // article found
      .mockReturnValueOnce(chainResolving([{ id: 99 }]));                // slug conflict

    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "article-foo",
      position: "0",
    });

    // Duplicate section slug is user input, not a crash — the action
    // returns the error (ToastForm surfaces it) instead of navigating.
    const result = await addExternalArticle("publisher-a", fd);
    expect(result).toEqual({
      error: "A section with that slug already exists in this book.",
    });
  });

  it("rejects on bad input — Zod throws for invalid articleSlug", async () => {
    const fd = makeFormData({
      bookId: "5",
      targetPublisher: "publisher-b",
      articleSlug: "no-prefix",
      position: "0",
    });

    await expect(addExternalArticle("publisher-a", fd)).rejects.toThrow();
  });
});

// ─── saveBookOutline ──────────────────────────────────────────────────────────

/** Awaitable select chain: every builder method returns itself; awaiting yields `rows`. */
function chainAll(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "leftJoin", "innerJoin", "orderBy"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

/** A transaction handle that records every write. */
function recordingTx() {
  const writes: { op: string; values?: unknown; set?: unknown }[] = [];
  let nextArticleId = 500;
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        writes.push({ op: "insert", values });
        const p = Promise.resolve([]);
        return Object.assign(p, { returning: vi.fn(async () => [{ id: nextArticleId++ }]) });
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((set: unknown) => ({
        where: vi.fn(async () => writes.push({ op: "update", set })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => writes.push({ op: "delete" })) })),
  };
  mockTransaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  return writes;
}

function outlineForm(payload: unknown): FormData {
  return makeFormData({ payload: JSON.stringify(payload) });
}

// Saved book 5: Part "A" (entry 1), internal section article-intro (entry 2).
const savedRows = [
  { entryId: 1, articleId: null, partTitle: "A", dividerLevel: "part", slug: null, isInternal: null },
  { entryId: 2, articleId: 20, partTitle: null, dividerLevel: null, slug: "article-intro", isInternal: true },
];

describe("saveBookOutline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
  });

  it("creates new sections with title-derived, in-book-unique slugs and re-positions everything", async () => {
    mockSelect
      .mockReturnValueOnce(chainAll([{ id: 5, slug: "book-x" }])) // book ownership
      .mockReturnValueOnce(chainAll(savedRows)) // saved outline
      .mockReturnValueOnce(chainAll([{ slug: "article-intro" }])); // book's internal slugs
    const writes = recordingTx();

    const result = await saveBookOutline(
      "publisher-a",
      outlineForm({
        bookId: 5,
        baseIds: [1, 2],
        items: [
          { kind: "part", entryId: 1, title: "A" },
          { kind: "chapter", title: "Basics" },
          { kind: "section", title: "Intro" },
          { kind: "section", entryId: 2 },
        ],
      })
    );

    expect(result).toBeUndefined();
    const inserts = writes.filter((w) => w.op === "insert").map((w) => w.values);
    expect(inserts).toContainEqual(
      expect.objectContaining({ bookId: 5, articleId: null, position: 1, partTitle: "Basics", dividerLevel: "chapter" })
    );
    // "Intro" collides with the saved article-intro → suffixed.
    expect(inserts).toContainEqual(
      expect.objectContaining({ slug: "article-intro-2", title: "Intro", isInternal: true, parentBookId: 5, ownerId: 10 })
    );
    expect(inserts).toContainEqual({ bookId: 5, articleId: 500, position: 2 });
    expect(writes.filter((w) => w.op === "update").map((w) => w.set)).toEqual([{ position: 0 }, { position: 3 }]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/publisher-a/books/book-x/edit");
  });

  it("refuses when the book changed since the editor loaded (stale base)", async () => {
    mockSelect
      .mockReturnValueOnce(chainAll([{ id: 5, slug: "book-x" }]))
      .mockReturnValueOnce(chainAll(savedRows))
      .mockReturnValueOnce(chainAll([]));

    const result = await saveBookOutline("publisher-a", outlineForm({ bookId: 5, baseIds: [2, 1], items: [] }));

    expect(result).toEqual({ error: expect.stringMatching(/changed since you opened/) });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects adding an article the publisher does not own (or that is internal)", async () => {
    mockSelect
      .mockReturnValueOnce(chainAll([{ id: 5, slug: "book-x" }]))
      .mockReturnValueOnce(chainAll(savedRows))
      .mockReturnValueOnce(chainAll([]))
      .mockReturnValueOnce(chainAll([])); // owned-standalone lookup finds nothing

    const result = await saveBookOutline(
      "publisher-a",
      outlineForm({
        bookId: 5,
        baseIds: [1, 2],
        items: [{ kind: "part", entryId: 1, title: "A" }, { kind: "section", entryId: 2 }, { kind: "section", articleId: 42 }],
      })
    );

    expect(result).toEqual({ error: expect.stringMatching(/not one of your standalone articles/) });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("removing an internal section deletes its article", async () => {
    mockSelect
      .mockReturnValueOnce(chainAll([{ id: 5, slug: "book-x" }]))
      .mockReturnValueOnce(chainAll(savedRows))
      .mockReturnValueOnce(chainAll([]));
    const writes = recordingTx();

    await saveBookOutline(
      "publisher-a",
      outlineForm({ bookId: 5, baseIds: [1, 2], items: [{ kind: "part", entryId: 1, title: "A" }] })
    );

    // Article delete + entry delete for entry 2, then entry 1 re-positioned.
    expect(writes.filter((w) => w.op === "delete")).toHaveLength(2);
    expect(writes.filter((w) => w.op === "update").map((w) => w.set)).toEqual([{ position: 0 }]);
  });

  it("returns a validation error for a malformed payload", async () => {
    const result = await saveBookOutline("publisher-a", makeFormData({ payload: "{not json" }));
    expect(result).toHaveProperty("error");
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
