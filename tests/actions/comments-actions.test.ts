// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockGetSession = vi.hoisted(() => vi.fn());
const mockRequireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireSession: mockRequireSession,
}));

// ─── Roles / publisher / access mocks ─────────────────────────────────────────

const mockCanEditContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/roles", () => ({ canEditContent: mockCanEditContent }));

const mockResolvePublisher = vi.hoisted(() => vi.fn());
vi.mock("@/lib/publisher", () => ({ resolvePublisher: mockResolvePublisher }));

const mockCanView = vi.hoisted(() => vi.fn());
vi.mock("@/lib/access", () => ({ canView: mockCanView }));

// ─── Comments helpers mock (cookies/headers live here) ────────────────────────

const mockGetClientIpHash = vi.hoisted(() => vi.fn());
const mockGetGuestTokenHash = vi.hoisted(() => vi.fn());
const mockVerifyTurnstile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/comments", () => ({
  GUEST_EDIT_WINDOW_MS: 15 * 60_000,
  getClientIpHash: mockGetClientIpHash,
  getGuestTokenHash: mockGetGuestTokenHash,
  verifyTurnstile: mockVerifyTurnstile,
}));

// ─── Rate limit mock ──────────────────────────────────────────────────────────

const mockRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mockRateLimit }));

// ─── Notifications mock ───────────────────────────────────────────────────────

const mockNotify = vi.hoisted(() => vi.fn());
const mockResolveArticleAuthors = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications", () => ({
  notify: mockNotify,
  resolveArticleAuthors: mockResolveArticleAuthors,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import {
  createComment,
  deleteComment,
  editComment,
  moderateComment,
  setGuestModeration,
} from "@/app/[publisher]/comments/actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.append(key, value);
  return fd;
}

/**
 * Chainable mock for the select shapes the actions use:
 *   .from().where().limit()            — lookups (resolves via .limit())
 *   .from().innerJoin().where()        — chapter-book scan (thenable .where())
 */
function selectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const whereResult = Object.assign(Promise.resolve(rows), { limit });
  const where = vi.fn().mockReturnValue(whereResult);
  const innerJoin = vi.fn().mockReturnValue({ where });
  const leftJoin = vi.fn().mockReturnValue({ where, innerJoin });
  const from = vi.fn().mockReturnValue({ where, innerJoin, leftJoin });
  return { from };
}

const userPub = {
  kind: "user" as const,
  userId: 10,
  orgId: null,
  slug: "alice",
  displayName: "Alice",
  allowUnmoderatedGuests: false,
};

const sessionAlice = {
  userId: 10,
  email: "alice@example.com",
  userSlug: "alice",
  isRootAdmin: false,
};

const articleRow = { id: 5, title: "On Motion", isInternal: false, parentBookId: null };
const bookRow = { id: 7, title: "Principia" };

/** Queue select results in order: subject lookup, [parent lookup], … */
function queueSelects(...rowSets: unknown[][]) {
  for (const rows of rowSets) mockSelect.mockReturnValueOnce(selectChain(rows));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolvePublisher.mockResolvedValue(userPub);
  mockCanView.mockResolvedValue(true);
  mockCanEditContent.mockResolvedValue(false);
  mockGetSession.mockResolvedValue(null);
  mockRequireSession.mockResolvedValue(sessionAlice);
  mockGetClientIpHash.mockResolvedValue("iphash");
  mockGetGuestTokenHash.mockResolvedValue("guesthash");
  mockVerifyTurnstile.mockResolvedValue(true);
  mockRateLimit.mockReturnValue(true);
  mockResolveArticleAuthors.mockResolvedValue([10]);

  const returning = vi.fn().mockResolvedValue([{ id: 99 }]);
  mockInsertValues.mockReturnValue({ returning });
  mockInsert.mockReturnValue({ values: mockInsertValues });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  mockUpdateSet.mockReturnValue({ where: updateWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
});

// ─── createComment — guests ───────────────────────────────────────────────────

describe("createComment (guest)", () => {
  it("inserts a pending guest comment and notifies the publisher", async () => {
    queueSelects([articleRow], []); // subject lookup, chapter-book scan

    await createComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ body: "Great read!", guestName: "Bob" })
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 5,
        bookId: null,
        authorId: null,
        guestName: "Bob",
        guestTokenHash: "guesthash",
        ipHash: "iphash",
        status: "pending",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/alice/articles/on-motion");
    expect(mockNotify).toHaveBeenCalledWith(
      10,
      "comment_posted",
      expect.objectContaining({ authorName: "Bob", pending: true, subjectTitle: "On Motion" })
    );
  });

  it("posts straight to approved when the publisher allows unmoderated guests", async () => {
    mockResolvePublisher.mockResolvedValue({ ...userPub, allowUnmoderatedGuests: true });
    queueSelects([articleRow], []);

    await createComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ body: "Nice", guestName: "Bob" })
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" })
    );
  });

  it("silently drops submissions that fill the honeypot", async () => {
    queueSelects([articleRow]);

    await createComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ body: "spam", guestName: "Bot", website: "https://spam.example" })
    );

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when the rate limit is exceeded", async () => {
    mockRateLimit.mockReturnValue(false);
    queueSelects([articleRow]);

    await expect(
      createComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ body: "Hi", guestName: "Bob" })
      )
    ).rejects.toThrow(/Too many comments/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects when Turnstile verification fails", async () => {
    mockVerifyTurnstile.mockResolvedValue(false);
    queueSelects([articleRow]);

    await expect(
      createComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ body: "Hi", guestName: "Bob" })
      )
    ).rejects.toThrow(/Verification failed/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects guests without a display name", async () => {
    queueSelects([articleRow]);

    await expect(
      createComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ body: "Hi" })
      )
    ).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("supports book subjects", async () => {
    queueSelects([bookRow]);

    await createComment(
      "alice",
      { kind: "book", slug: "principia" },
      makeFormData({ body: "Fantastic book", guestName: "Bob" })
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: null, bookId: 7, status: "pending" })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/alice/books/principia");
  });

  it("rejects replies to comments that don't exist on the subject", async () => {
    queueSelects([articleRow], []); // subject ok, parent lookup empty

    await expect(
      createComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ body: "Hi", guestName: "Bob", parentId: "123" })
      )
    ).rejects.toThrow(/Parent comment not found/);
  });

  it("refuses comments on subjects the caller cannot view", async () => {
    mockCanView.mockResolvedValue(false);
    queueSelects([articleRow]);

    await expect(
      createComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ body: "Hi", guestName: "Bob" })
      )
    ).rejects.toThrow(/Forbidden/);
  });
});

// ─── createComment — logged in ────────────────────────────────────────────────

describe("createComment (logged in)", () => {
  it("inserts approved with the session author and skips self-notification", async () => {
    mockGetSession.mockResolvedValue(sessionAlice);
    queueSelects([articleRow], []);

    await createComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ body: "Author here" })
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: 10, status: "approved" })
    );
    // The only would-be recipient is the commenter — no notification.
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
  });
});

// ─── editComment ──────────────────────────────────────────────────────────────

const recentGuestComment = {
  id: 42,
  authorId: null,
  guestTokenHash: "guesthash",
  createdAt: new Date(Date.now() - 5 * 60_000),
};

describe("editComment", () => {
  it("lets the logged-in author edit", async () => {
    mockGetSession.mockResolvedValue(sessionAlice);
    queueSelects([articleRow], [{ ...recentGuestComment, authorId: 10 }], []);

    await editComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ commentId: "42", body: "edited" })
    );

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ body: "edited" })
    );
  });

  it("lets the owning guest edit within the window", async () => {
    queueSelects([articleRow], [recentGuestComment], []);

    await editComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ commentId: "42", body: "edited" })
    );

    expect(mockUpdateSet).toHaveBeenCalled();
  });

  it("rejects a guest whose cookie token doesn't match", async () => {
    mockGetGuestTokenHash.mockResolvedValue("someone-else");
    queueSelects([articleRow], [recentGuestComment]);

    await expect(
      editComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ commentId: "42", body: "hijack" })
      )
    ).rejects.toThrow(/Forbidden/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects guest edits after the edit window", async () => {
    queueSelects([
      articleRow,
    ], [
      { ...recentGuestComment, createdAt: new Date(Date.now() - 60 * 60_000) },
    ]);

    await expect(
      editComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ commentId: "42", body: "too late" })
      )
    ).rejects.toThrow(/Forbidden/);
  });
});

// ─── deleteComment ────────────────────────────────────────────────────────────

describe("deleteComment", () => {
  it("lets a publisher editor delete any comment", async () => {
    mockGetSession.mockResolvedValue({ ...sessionAlice, userId: 77 });
    mockCanEditContent.mockResolvedValue(true);
    mockGetGuestTokenHash.mockResolvedValue(null);
    queueSelects([articleRow], [{ ...recentGuestComment }], []);

    await deleteComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ commentId: "42" })
    );

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) })
    );
  });

  it("rejects strangers", async () => {
    mockGetSession.mockResolvedValue({ ...sessionAlice, userId: 77 });
    mockGetGuestTokenHash.mockResolvedValue(null);
    queueSelects([articleRow], [{ ...recentGuestComment }]);

    await expect(
      deleteComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ commentId: "42" })
      )
    ).rejects.toThrow(/Forbidden/);
  });
});

// ─── moderateComment ──────────────────────────────────────────────────────────

describe("moderateComment", () => {
  it("lets an editor approve a pending comment", async () => {
    mockCanEditContent.mockResolvedValue(true);
    queueSelects([articleRow], [{ ...recentGuestComment }], []);

    await moderateComment(
      "alice",
      { kind: "article", slug: "on-motion" },
      makeFormData({ commentId: "42", status: "approved" })
    );

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/alice/comments");
  });

  it("rejects non-editors", async () => {
    mockCanEditContent.mockResolvedValue(false);
    queueSelects([articleRow]);

    await expect(
      moderateComment(
        "alice",
        { kind: "article", slug: "on-motion" },
        makeFormData({ commentId: "42", status: "spam" })
      )
    ).rejects.toThrow(/Forbidden/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── setGuestModeration ───────────────────────────────────────────────────────

describe("setGuestModeration", () => {
  it("lets an editor toggle unmoderated guest posting", async () => {
    mockCanEditContent.mockResolvedValue(true);

    await setGuestModeration("alice", makeFormData({ allowUnmoderatedGuests: "true" }));

    expect(mockUpdateSet).toHaveBeenCalledWith({ allowUnmoderatedGuests: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/alice/comments");
  });

  it("rejects non-editors", async () => {
    mockCanEditContent.mockResolvedValue(false);

    await expect(
      setGuestModeration("alice", makeFormData({ allowUnmoderatedGuests: "true" }))
    ).rejects.toThrow(/Forbidden/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
