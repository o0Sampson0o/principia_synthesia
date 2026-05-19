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
import { removeEventGrant } from "@/app/[publisher]/events/[eventSlug]/access/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

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

// ─── removeEventGrant tests ───────────────────────────────────────────────────

describe("removeEventGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    setupDelete();
  });

  it("calls db.delete with all five scoping conditions (id, resourceType, ownerType, ownerId, resourceKey)", async () => {
    const fd = makeFormData({ grantId: "42" });
    await removeEventGrant("publisher-a", "event-my-conference", fd);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);

    expect(and).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    const andCall = vi.mocked(and).mock.calls[0];
    expect(andCall).toHaveLength(5);
  });

  it("scopes the delete to resourceType 'event'", async () => {
    const fd = makeFormData({ grantId: "1" });
    await removeEventGrant("publisher-a", "event-my-conference", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const typeCall = eqCalls.find((c) => c[1] === "event");
    expect(typeCall).toBeDefined();
  });

  it("scopes the delete to the correct eventSlug", async () => {
    const fd = makeFormData({ grantId: "8" });
    await removeEventGrant("publisher-a", "event-specific-slug", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const slugCall = eqCalls.find((c) => c[1] === "event-specific-slug");
    expect(slugCall).toBeDefined();
  });

  it("scopes the delete to the correct ownerId", async () => {
    const fd = makeFormData({ grantId: "5" });
    await removeEventGrant("publisher-a", "event-my-conference", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const ownerIdCall = eqCalls.find((c) => c[1] === 10);
    expect(ownerIdCall).toBeDefined();
  });
});
