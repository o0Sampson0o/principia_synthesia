// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
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

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockRevalidateTag = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
}));

// ─── next/navigation mock ─────────────────────────────────────────────────────

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

// ─── Drizzle-orm — pass through so we can inspect conditions ──────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
    inArray: vi.fn((...args) => actual.inArray(...(args as Parameters<typeof actual.inArray>))),
  };
});

import { and, eq } from "drizzle-orm";
import { createEvent, updateEvent, deleteEvent } from "@/app/[publisher]/events/actions";
import {
  setupSelectQueue,
  setupInsertQueue,
  setupUpdateQueue,
  setupDeleteQueue,
} from "@/tests/helpers/drizzle-mocks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── createEvent ──────────────────────────────────────────────────────────────

describe("createEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
  });

  it("inserts an event and redirects to the event page", async () => {
    setupInsertQueue(mockInsert, mockInsertValues, mockInsertReturning, { id: 1, slug: "event-foo" });
    setupDeleteQueue(mockDelete, mockDeleteWhere);
    setupSelectQueue(mockSelect, [{ result: [], withLimit: false }]);

    mockInsert.mockImplementation((table) => {
      if (table && (table as { _: { name: string } })?._?.name === "event_articles") {
        return { values: vi.fn().mockResolvedValue([]) };
      }
      return { values: mockInsertValues };
    });

    const fd = makeFormData({
      title: "Foo Conference",
      slug: "event-foo",
      eventDate: "2024-06-15",
    });

    await createEvent("publisher-a", null, fd);

    expect(mockRedirect).toHaveBeenCalledWith("/publisher-a/events/event-foo");
  });

  it("returns errors for invalid Zod input (missing title)", async () => {
    const fd = makeFormData({
      slug: "event-foo",
      eventDate: "2024-06-15",
    });

    const result = await createEvent("publisher-a", null, fd);
    expect(result).toBeDefined();
    expect((result as { errors: Record<string, string[]> }).errors).toHaveProperty("title");
  });

  it("throws when canEditContent returns false", async () => {
    mockCanEditContent.mockResolvedValue(false);

    const fd = makeFormData({
      title: "Foo",
      slug: "event-foo",
      eventDate: "2024-06-15",
    });

    await expect(createEvent("publisher-a", null, fd)).rejects.toThrow("Forbidden");
  });

  it("calls revalidateTag with 'timeline'", async () => {
    setupInsertQueue(mockInsert, mockInsertValues, mockInsertReturning, { id: 2, slug: "event-bar" });
    setupDeleteQueue(mockDelete, mockDeleteWhere);
    setupSelectQueue(mockSelect, [{ result: [], withLimit: false }]);

    mockInsert.mockImplementation((table) => {
      if (table && (table as { _: { name: string } })?._?.name === "event_articles") {
        return { values: vi.fn().mockResolvedValue([]) };
      }
      return { values: mockInsertValues };
    });

    const fd = makeFormData({
      title: "Bar Summit",
      slug: "event-bar",
      eventDate: "2024-09-01",
    });

    await createEvent("publisher-a", null, fd);

    expect(mockRevalidateTag).toHaveBeenCalledWith("timeline", "default");
  });
});

// ─── updateEvent ──────────────────────────────────────────────────────────────

describe("updateEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
  });

  it("returns errors for invalid Zod input without throwing", async () => {
    const fd = makeFormData({
      id: "99",
      slug: "not-an-event-slug",
      eventDate: "2024-06-15",
    });

    const result = await updateEvent("publisher-a", null, fd);
    expect(result).toBeDefined();
    expect((result as { errors: Record<string, string[]> }).errors).toHaveProperty("slug");
  });

  it("scopes the DB update to ownerType + ownerId", async () => {
    setupUpdateQueue(mockUpdate, mockUpdateSet, mockUpdateWhere);
    setupDeleteQueue(mockDelete, mockDeleteWhere);
    setupSelectQueue(mockSelect, [
      { result: [{ id: 5 }], withLimit: true },  // existingEvent ownership check
      { result: [], withLimit: false },            // article lookup in setEventArticleLinks
    ]);

    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });

    const fd = makeFormData({
      id: "5",
      title: "Updated Conference",
      slug: "event-updated-conference",
      eventDate: "2024-07-01",
    });

    await updateEvent("publisher-a", null, fd);

    expect(and).toHaveBeenCalled();
    const andCalls = vi.mocked(and).mock.calls;
    const updateAndCall = andCalls.find((call) => call.length === 3);
    expect(updateAndCall).toBeDefined();
  });

  it("redirects to the event page on success", async () => {
    setupUpdateQueue(mockUpdate, mockUpdateSet, mockUpdateWhere);
    setupDeleteQueue(mockDelete, mockDeleteWhere);
    setupSelectQueue(mockSelect, [
      { result: [{ id: 7 }], withLimit: true },  // existingEvent ownership check
      { result: [], withLimit: false },            // article lookup in setEventArticleLinks
    ]);

    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });

    const fd = makeFormData({
      id: "7",
      title: "Symposium",
      slug: "event-symposium",
      eventDate: "2024-08-10",
    });

    await updateEvent("publisher-a", null, fd);

    expect(mockRedirect).toHaveBeenCalledWith("/publisher-a/events/event-symposium");
  });
});

// ─── deleteEvent ──────────────────────────────────────────────────────────────

describe("deleteEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    setupDeleteQueue(mockDelete, mockDeleteWhere);
  });

  it("calls db.delete and redirects to the events list", async () => {
    const fd = makeFormData({ id: "3", slug: "event-foo" });

    await deleteEvent("publisher-a", fd);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/publisher-a/events");
  });

  it("calls revalidateTag with 'timeline'", async () => {
    const fd = makeFormData({ id: "4", slug: "event-bar" });

    await deleteEvent("publisher-a", fd);

    expect(mockRevalidateTag).toHaveBeenCalledWith("timeline", "default");
  });

  it("scopes the delete to ownerType + ownerId", async () => {
    const fd = makeFormData({ id: "10", slug: "event-test" });

    await deleteEvent("publisher-a", fd);

    const eqCalls = vi.mocked(eq).mock.calls;
    const ownerIdCall = eqCalls.find((c) => c[1] === 10);
    expect(ownerIdCall).toBeDefined();
    const ownerTypeCall = eqCalls.find((c) => c[1] === "user");
    expect(ownerTypeCall).toBeDefined();
  });
});
