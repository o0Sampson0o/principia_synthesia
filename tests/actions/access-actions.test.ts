// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    delete: mockDelete,
  },
}));

// ─── Auth mock ───────────────────────────────────────────────────────────────

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

// ─── next/cache mock ─────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ─── Drizzle-orm — pass through eq/and so we can inspect call args ────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
  };
});

import { eq, and } from "drizzle-orm";
import { removeBookGrant } from "@/app/[publisher]/books/[bookSlug]/access/actions";
import { removeArticleGrant } from "@/app/[publisher]/articles/[slug]/access/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

/** Set up the default publisher A session */
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

function setupDelete() {
  mockDeleteWhere.mockResolvedValue({ rowCount: 1 });
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
}

// ─── removeBookGrant tests ────────────────────────────────────────────────────

describe("removeBookGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    setupDelete();
  });

  it("calls db.delete with all five scoping conditions (id, resourceType, ownerType, ownerId, resourceKey)", async () => {
    const fd = makeFormData({ grantId: "42" });
    await removeBookGrant("publisher-a", "book-math-101", fd);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);

    // Verify and() was called with 5 conditions
    expect(and).toHaveBeenCalledWith(
      expect.anything(), // eq(id, 42)
      expect.anything(), // eq(resourceType, "book")
      expect.anything(), // eq(ownerType, "user")
      expect.anything(), // eq(ownerId, 10)
      expect.anything()  // eq(resourceKey, "book-math-101")
    );
    const andCall = vi.mocked(and).mock.calls[0];
    expect(andCall).toHaveLength(5);
  });

  it("scopes the delete to the correct resourceKey (bookSlug)", async () => {
    const fd = makeFormData({ grantId: "99" });
    await removeBookGrant("publisher-a", "book-physics", fd);

    // eq should have been called with the book slug among its arguments
    const eqCalls = vi.mocked(eq).mock.calls;
    const slugCall = eqCalls.find((c) => c[1] === "book-physics");
    expect(slugCall).toBeDefined();
  });

  it("scopes the delete to resourceType 'book'", async () => {
    const fd = makeFormData({ grantId: "1" });
    await removeBookGrant("publisher-a", "book-calc", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const typeCall = eqCalls.find((c) => c[1] === "book");
    expect(typeCall).toBeDefined();
  });
});

// ─── removeArticleGrant tests ─────────────────────────────────────────────────

describe("removeArticleGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    setupDelete();
  });

  it("calls db.delete with all five scoping conditions (id, resourceType, ownerType, ownerId, resourceKey)", async () => {
    const fd = makeFormData({ grantId: "77" });
    await removeArticleGrant("publisher-a", "article-intro-to-calc", fd);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);

    expect(and).toHaveBeenCalledWith(
      expect.anything(), // eq(id, 77)
      expect.anything(), // eq(resourceType, "article")
      expect.anything(), // eq(ownerType, "user")
      expect.anything(), // eq(ownerId, 10)
      expect.anything()  // eq(resourceKey, "article-intro-to-calc")
    );
    const andCall = vi.mocked(and).mock.calls[0];
    expect(andCall).toHaveLength(5);
  });

  it("scopes the delete to resourceType 'article'", async () => {
    const fd = makeFormData({ grantId: "5" });
    await removeArticleGrant("publisher-a", "article-topology", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const typeCall = eqCalls.find((c) => c[1] === "article");
    expect(typeCall).toBeDefined();
  });

  it("scopes the delete to the correct articleSlug", async () => {
    const fd = makeFormData({ grantId: "8" });
    await removeArticleGrant("publisher-a", "article-topology", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const slugCall = eqCalls.find((c) => c[1] === "article-topology");
    expect(slugCall).toBeDefined();
  });
});
