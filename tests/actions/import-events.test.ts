// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertOnConflict = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ─── recurrence mock ──────────────────────────────────────────────────────────

vi.mock("@/lib/recurrence", () => ({
  buildRruleString: vi.fn().mockReturnValue("FREQ=WEEKLY"),
  expandRecurrence: vi.fn().mockReturnValue([]),
  getNextOccurrences: vi.fn().mockReturnValue([]),
  describeRecurrence: vi.fn().mockReturnValue(""),
}));

// ─── Setup helpers ────────────────────────────────────────────────────────────

function setupSelectQueue(rows: unknown[]) {
  mockSelectWhere.mockResolvedValue(rows);
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

function setupInsertChain(returnedRows: { id: number }[] = []) {
  mockInsertReturning.mockResolvedValue(returnedRows);
  mockInsertOnConflict.mockReturnValue({ returning: mockInsertReturning });
  mockInsertValues.mockReturnValue({ onConflictDoNothing: mockInsertOnConflict });
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

function setupUpdateChain() {
  mockUpdateWhere.mockResolvedValue([]);
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
}

import { previewImport, confirmImport } from "@/app/[publisher]/events/import/actions";

const PUBLISHER_SLUG = "alice";
const USER_PUB = { kind: "user", userId: 1, orgId: null, slug: "alice", displayName: "Alice" };

function makeFormData(format: string, content: string): FormData {
  const fd = new FormData();
  fd.set("format", format);
  const blob = new Blob([content], { type: "text/plain" });
  fd.set("file", new File([blob], `import.${format}`, { type: "text/plain" }));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({ userId: 1 });
  mockCanEditContent.mockResolvedValue(true);
  mockResolvePublisher.mockResolvedValue(USER_PUB);
  setupSelectQueue([]);
  setupInsertChain([{ id: 1 }]);
  setupUpdateChain();
});

describe("previewImport", () => {
  it("returns error when user lacks edit rights", async () => {
    mockCanEditContent.mockResolvedValue(false);
    const fd = makeFormData("csv", "title,slug,eventDate\n");
    await expect(previewImport(PUBLISHER_SLUG, null, fd)).rejects.toThrow("Forbidden");
  });

  it("returns error for invalid format", async () => {
    const fd = new FormData();
    fd.set("format", "xml");
    const result = await previewImport(PUBLISHER_SLUG, null, fd);
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("returns preview counts for valid CSV", async () => {
    const csv = "title,slug,eventDate\nCold War,event-cold-war,1947-03-12";
    const fd = makeFormData("csv", csv);
    const result = await previewImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.toInsert).toBe(1);
    expect(result.toUpdate).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("marks existing slugs as toUpdate in preview", async () => {
    setupSelectQueue([{ ownerType: "user", ownerId: 1, slug: "event-cold-war" }]);
    const csv = "title,slug,eventDate\nCold War,event-cold-war,1947-03-12";
    const fd = makeFormData("csv", csv);
    const result = await previewImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.toInsert).toBe(0);
    expect(result.toUpdate).toBe(1);
  });

  it("returns row-level errors for invalid rows", async () => {
    const csv = "title,slug,eventDate\nBad,event-bad,not-a-date";
    const fd = makeFormData("csv", csv);
    const result = await previewImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
  });

  it("returns preview counts for valid JSON", async () => {
    const json = JSON.stringify([
      { title: "Sputnik", slug: "event-sputnik", eventDate: "1957-10-04" },
    ]);
    const fd = makeFormData("json", json);
    const result = await previewImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.toInsert).toBe(1);
    expect(result.toUpdate).toBe(0);
  });
});

describe("confirmImport", () => {
  it("inserts new events and returns count from .returning()", async () => {
    setupInsertChain([{ id: 10 }]);
    const csv = "title,slug,eventDate\nCold War,event-cold-war,1947-03-12";
    const fd = makeFormData("csv", csv);
    const result = await confirmImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertReturning).toHaveBeenCalled();
  });

  it("returns correct inserted count when conflicts are skipped", async () => {
    setupInsertChain([{ id: 1 }, { id: 2 }]);
    const csv = [
      "title,slug,eventDate",
      "Event A,event-a,1947-01-01",
      "Event B,event-b,1947-02-01",
      "Event C,event-c,1947-03-01",
    ].join("\n");
    const fd = makeFormData("csv", csv);
    const result = await confirmImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.inserted).toBe(2);
  });

  it("updates existing events", async () => {
    setupSelectQueue([{ ownerType: "user", ownerId: 1, slug: "event-cold-war" }]);
    const csv = "title,slug,eventDate\nCold War Updated,event-cold-war,1947-03-12";
    const fd = makeFormData("csv", csv);
    const result = await confirmImport(PUBLISHER_SLUG, null, fd);
    if ("error" in result) throw new Error(result.error);
    expect(result.updated).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns error when user lacks edit rights", async () => {
    mockCanEditContent.mockResolvedValue(false);
    const fd = makeFormData("csv", "title,slug,eventDate\n");
    await expect(confirmImport(PUBLISHER_SLUG, null, fd)).rejects.toThrow("Forbidden");
  });
});
