// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: mockUpdate,
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

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
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

import { markArticleVerified } from "@/app/[publisher]/articles/actions";
import { setupUpdateQueue } from "@/tests/helpers/drizzle-mocks";

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

describe("markArticleVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisher();
  });

  it("updates lastVerifiedAt and returns ok:true", async () => {
    setupUpdateQueue(mockUpdate, mockUpdateSet, mockUpdateWhere);

    const fd = makeFormData({ articleId: "5", publisherSlug: "alice" });
    const result = await markArticleVerified("alice", fd);

    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastVerifiedAt: expect.any(Date) })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/alice");
  });

  it("throws when edit rights are not held", async () => {
    mockCanEditContent.mockResolvedValue(false);

    const fd = makeFormData({ articleId: "5", publisherSlug: "alice" });
    await expect(markArticleVerified("alice", fd)).rejects.toThrow("Forbidden");
  });
});
