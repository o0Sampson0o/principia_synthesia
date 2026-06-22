// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockInsert = vi.hoisted(() => vi.fn());

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
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

// ─── drizzle-orm pass-through ─────────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
  };
});

import { createEra, renameEra, updateEra, deleteEra } from "@/app/[publisher]/events/eras/actions";

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

function setupTxInsert() {
  const txInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([]),
  });
  const tx = { insert: txInsert };
  mockTransaction.mockImplementation(async (cb: (tx: { insert: typeof txInsert }) => Promise<void>) => {
    await cb(tx);
  });
  return txInsert;
}

// ─── createEra ────────────────────────────────────────────────────────────────

describe("createEra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
  });

  it("throws when canEditContent returns false", async () => {
    mockCanEditContent.mockResolvedValue(false);
    const fd = makeFormData({ name: "Modern Age", startDate: "2000-01-01" });
    await expect(createEra("publisher-a", null, fd)).rejects.toThrow("Forbidden");
  });

  it("returns validation errors for missing name", async () => {
    const fd = makeFormData({ startDate: "2000-01-01" });
    const result = await createEra("publisher-a", null, fd);
    expect(result).toHaveProperty("errors.name");
  });

  it("inserts only start event when endDate is omitted", async () => {
    const txInsert = setupTxInsert();
    const fd = makeFormData({ name: "Modern Age", startDate: "2000-01-01" });
    await createEra("publisher-a", null, fd);
    expect(txInsert).toHaveBeenCalledTimes(1);
  });

  it("inserts both start and end events when endDate is provided", async () => {
    const txInsert = setupTxInsert();
    const fd = makeFormData({
      name: "Cold War Era",
      startDate: "1947-01-01",
      endDate: "1991-12-25",
    });
    await createEra("publisher-a", null, fd);
    expect(txInsert).toHaveBeenCalledTimes(2);
  });

  it("redirects to the era detail page on success", async () => {
    setupTxInsert();
    const fd = makeFormData({ name: "Modern Age", startDate: "2000-01-01" });
    await createEra("publisher-a", null, fd);
    expect(mockRedirect).toHaveBeenCalledWith("/publisher-a/events/eras/modern-age");
  });
});

// ─── renameEra ────────────────────────────────────────────────────────────────

describe("renameEra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
  });

  function setupTxUpdate() {
    const txUpdateWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
    const tx = { update: txUpdate };
    mockTransaction.mockImplementation(async (cb: (tx: { update: typeof txUpdate }) => Promise<void>) => {
      await cb(tx);
    });
    return txUpdate;
  }

  it("returns validation errors for missing newName", async () => {
    const fd = makeFormData({ currentName: "Old Name" });
    const result = await renameEra("publisher-a", null, fd);
    expect(result).toHaveProperty("errors.newName");
  });

  it("runs three updates inside a transaction and redirects", async () => {
    const txUpdate = setupTxUpdate();
    const fd = makeFormData({ currentName: "Old Name", newName: "New Name" });
    await renameEra("publisher-a", null, fd);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(3);
    expect(mockRedirect).toHaveBeenCalledWith("/publisher-a/events/eras/new-name");
  });
});

// ─── updateEra ────────────────────────────────────────────────────────────────

describe("updateEra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    mockUpdateWhere.mockResolvedValue({ rowCount: 1 });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("returns validation errors for missing startDate", async () => {
    const fd = makeFormData({ eraName: "Modern Age", startEventId: "1" });
    const result = await updateEra("publisher-a", null, fd);
    expect(result).toHaveProperty("errors.startDate");
  });

  it("returns error when endDate is before startDate", async () => {
    const fd = makeFormData({
      eraName: "Modern Age",
      startEventId: "1",
      startDate: "2000-01-01",
      endEventId: "2",
      endDate: "1990-01-01",
    });
    const result = await updateEra("publisher-a", null, fd);
    expect(result).toHaveProperty("errors.endDate");
  });

  it("updates only the start event when endEventId is absent", async () => {
    const fd = makeFormData({
      eraName: "Modern Age",
      startEventId: "1",
      startDate: "2000-01-01",
    });
    const result = await updateEra("publisher-a", null, fd);
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("updates both start and end events when both IDs and dates are provided", async () => {
    const fd = makeFormData({
      eraName: "Cold War Era",
      startEventId: "1",
      startDate: "1947-01-01",
      endEventId: "2",
      endDate: "1991-12-25",
    });
    const result = await updateEra("publisher-a", null, fd);
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});

// ─── deleteEra ────────────────────────────────────────────────────────────────

describe("deleteEra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPublisherA();
    mockDeleteWhere.mockResolvedValue({ rowCount: 1 });
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
  });

  it("deletes only the start event when endEventId is absent", async () => {
    const fd = makeFormData({ eraName: "Modern Age", startEventId: "1" });
    await deleteEra("publisher-a", fd);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("deletes both marker events when endEventId is provided", async () => {
    const fd = makeFormData({
      eraName: "Cold War Era",
      startEventId: "1",
      endEventId: "2",
    });
    await deleteEra("publisher-a", fd);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("redirects to the eras list on success", async () => {
    const fd = makeFormData({ eraName: "Modern Age", startEventId: "1" });
    await deleteEra("publisher-a", fd);
    expect(mockRedirect).toHaveBeenCalledWith("/publisher-a/events/eras");
  });
});
