// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
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

// ─── Notifications mock ───────────────────────────────────────────────────────

const mockNotify = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  notify: mockNotify,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// ─── next/navigation mock ─────────────────────────────────────────────────────

const mockRedirect = vi.hoisted(() => vi.fn().mockImplementation(() => { throw new Error("NEXT_REDIRECT"); }));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

// ─── Drizzle-orm — pass through ───────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { forkArticle } from "@/app/[publisher]/articles/fork-action";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

/**
 * Sets up the select mock to return queued responses.
 * Chain: .from().where().limit() or .from().where()
 */
function setupSelectQueue(...responses: unknown[][]) {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const result = responses[idx++] ?? [];
    const limitFn = vi.fn().mockResolvedValue(result);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    return { from: fromFn };
  });
}

/**
 * Sets up select to handle chains with optional join (.leftJoin) before .where().limit()
 */
function setupSelectWithJoinQueue(...responses: unknown[][]) {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const result = responses[idx++] ?? [];
    const limitFn = vi.fn().mockResolvedValue(result);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const leftJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, leftJoin: leftJoinFn });
    return { from: fromFn };
  });
}

// ─── Standard session / publisher setup ──────────────────────────────────────

function setupForkerSession() {
  mockRequireSession.mockResolvedValue({
    userId: 99,
    email: "forker@example.com",
    userSlug: "forker",
    isRootAdmin: false,
  });
}

function setupSourcePublisher() {
  mockResolvePublisher.mockImplementation(async (slug: string) => {
    if (slug === "alice") {
      return { kind: "user", userId: 1, orgId: null, slug: "alice", displayName: "Alice" };
    }
    if (slug === "forker") {
      return { kind: "user", userId: 99, orgId: null, slug: "forker", displayName: "Forker" };
    }
    return null;
  });
}

// ─── forkArticle – happy path ─────────────────────────────────────────────────

describe("forkArticle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a forked article and redirects to the edit page", async () => {
    setupForkerSession();
    setupSourcePublisher();
    mockCanView.mockResolvedValue(true);
    mockNotify.mockResolvedValue(undefined);

    // Calls in order:
    // 1. fetch source article → found
    // 2. check slug collision (article-intro-fork) → not found (empty)
    // 3. insert returning → forked row
    // 4. orgMemberships for notify → [user id 1]

    // For the source article fetch: .from().where().limit()
    // For slug collision check: .from().where().limit()
    // For orgMemberships: .from().where()
    setupSelectQueue(
      [{ id: 5, slug: "article-intro", title: "Intro", ownerType: "user", ownerId: 1, content: "body", summary: null, metadata: { status: "published", tags: [], description: "", canvas: null }, forkedFromId: null }],
      [], // slug collision check — no existing fork slug
    );

    mockInsertReturning.mockResolvedValue([{ id: 200, slug: "article-intro-fork" }]);
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsert.mockReturnValue({ values: mockInsertValues });

    // orgMemberships for resolveAuthors (user owner → [1])
    // This path returns early without a DB call for user-owned source

    const fd = makeFormData({
      sourcePublisherSlug: "alice",
      sourceArticleSlug: "article-intro",
    });

    await expect(forkArticle(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "article-intro-fork",
        forkedFromId: 5,
        ownerType: "user",
        ownerId: 99,
      })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/forker/articles/article-intro-fork/edit");
    expect(mockNotify).toHaveBeenCalledWith(1, "article_forked", expect.objectContaining({
      originalSlug: "article-intro",
    }));
  });

  it("tries next slug when the first candidate collides", async () => {
    setupForkerSession();
    setupSourcePublisher();
    mockCanView.mockResolvedValue(true);
    mockNotify.mockResolvedValue(undefined);

    setupSelectQueue(
      // source article
      [{ id: 5, slug: "article-intro", title: "Intro", ownerType: "user", ownerId: 1, content: "body", summary: null, metadata: { status: "published", tags: [], description: "", canvas: null }, forkedFromId: null }],
      // slug "article-intro-fork" → collision (exists)
      [{ id: 999 }],
      // slug "article-intro-fork-2" → free
      [],
    );

    mockInsertReturning.mockResolvedValue([{ id: 201, slug: "article-intro-fork-2" }]);
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsert.mockReturnValue({ values: mockInsertValues });

    const fd = makeFormData({
      sourcePublisherSlug: "alice",
      sourceArticleSlug: "article-intro",
    });

    await expect(forkArticle(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "article-intro-fork-2" })
    );
  });

  it("throws when the user cannot view the source article", async () => {
    setupForkerSession();
    setupSourcePublisher();
    mockCanView.mockResolvedValue(false);

    setupSelectQueue(
      [{ id: 5, slug: "article-intro", title: "Intro", ownerType: "user", ownerId: 1, content: "", summary: null, metadata: { status: "published", tags: [], description: "", canvas: null }, forkedFromId: null }]
    );

    const fd = makeFormData({
      sourcePublisherSlug: "alice",
      sourceArticleSlug: "article-intro",
    });

    await expect(forkArticle(fd)).rejects.toThrow("Access denied.");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
