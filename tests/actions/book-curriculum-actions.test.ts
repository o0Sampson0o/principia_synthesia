// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
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

import { addExternalArticle, upsertCurriculumEntry } from "@/app/[publisher]/books/actions";

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
      /same-publisher chapter picker/
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

    // Duplicate chapter slug is user input, not a crash — the action
    // redirects back to the book editor with an error param. (This file's
    // local next/navigation mock makes redirect a no-op, so assert the call.)
    const { redirect } = await import("next/navigation");
    await addExternalArticle("publisher-a", fd);
    expect(redirect).toHaveBeenCalledWith(
      "/publisher-a/books/book-x/edit?error=chapter_slug_taken"
    );
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

// ─── upsertCurriculumEntry security ───────────────────────────────────────────

describe("upsertCurriculumEntry security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
  });

  it("rejects when the article's owner differs from the host publisher", async () => {
    // book ownership check passes, then article ownership check fails (ownerId 99 ≠ host 10)
    mockSelect
      .mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }]))       // book ownership
      .mockReturnValueOnce(chainResolving([{ ownerType: "user", ownerId: 99 }])); // article wrong owner

    const fd = makeFormData({
      bookId: "5",
      articleId: "42",
      position: "0",
    });

    await expect(upsertCurriculumEntry("publisher-a", fd)).rejects.toThrow(
      /not owned by the current publisher/
    );
  });

  it("allows when the article's owner matches and inserts a new entry", async () => {
    // book ownership → article ownership (matches) → existing entry lookup
    mockSelect
      .mockReturnValueOnce(chainResolving([{ id: 5, slug: "book-x" }]))          // book ownership
      .mockReturnValueOnce(chainResolving([{ ownerType: "user", ownerId: 10 }])) // art check
      .mockReturnValueOnce(chainResolving([]));                                   // existing entry lookup

    mockInsertValues.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });

    const fd = makeFormData({
      bookId: "5",
      articleId: "42",
      position: "0",
    });

    await upsertCurriculumEntry("publisher-a", fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: 5, articleId: 42 })
    );
  });
});
