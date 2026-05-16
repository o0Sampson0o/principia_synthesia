// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────
const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateSetWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT: ${url}`), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    });
  }),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    ilike: vi.fn((col, val) => ({ _type: "ilike", col, val })),
  };
});

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createKaoObject,
  updateKaoObject,
  deleteKaoObject,
} from "@/app/admin/objects/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

const adminSession = { userId: 1, email: "admin@example.com", isAdmin: true };

function setupInsert(rows: unknown[] = [{ id: 1, slug: "test-anim" }]) {
  mockInsertReturning.mockResolvedValue(rows);
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

function setupUpdate() {
  mockUpdateSetWhere.mockResolvedValue(undefined);
  mockUpdateSet.mockReturnValue({ where: mockUpdateSetWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
}

function setupDelete() {
  mockDeleteWhere.mockResolvedValue(undefined);
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
}

// Mocks db.select().from().where().limit() to return `rows`.
// By default returns a non-plugin row so guards pass.
function setupSelect(rows: unknown[] = [{ source: null }]) {
  mockSelectFromWhere.mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) });
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

// ─── createKaoObject ──────────────────────────────────────────────────────────

describe("createKaoObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
  });

  it("calls db.insert, revalidatePath, and redirect on valid input", async () => {
    setupInsert([{ id: 1, slug: "pendulum-anim" }]);

    const fd = makeFormData({
      slug: "pendulum-anim",
      name: "Pendulum Animation",
      type: "animation",
      content: '{"fps":60}',
      description: "A pendulum",
    });

    await expect(createKaoObject(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockInsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/objects");
    expect(revalidatePath).toHaveBeenCalledWith("/objects");
    expect(redirect).toHaveBeenCalledWith("/admin/objects/pendulum-anim");
  });

  it("returns { errors: { content } } when content is invalid JSON", async () => {
    const fd = makeFormData({
      slug: "test-anim",
      name: "Test",
      type: "animation",
      content: "not-valid-json",
    });

    const result = await createKaoObject(null, fd);
    expect(result).toMatchObject({ errors: { content: expect.arrayContaining([expect.any(String)]) } });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when getSession returns null", async () => {
    mockGetSession.mockResolvedValue(null);

    const fd = makeFormData({
      slug: "test-anim",
      name: "Test",
      type: "animation",
      content: '{}',
    });

    await expect(createKaoObject(null, fd)).rejects.toThrow("Unauthorized");
  });

  it("returns { errors } when required fields are missing", async () => {
    const fd = makeFormData({
      slug: "",
      name: "",
      type: "animation",
      content: '{}',
    });

    const result = await createKaoObject(null, fd);
    expect(result).toHaveProperty("errors");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ─── updateKaoObject ──────────────────────────────────────────────────────────

describe("updateKaoObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
  });

  it("calls db.update and redirect on valid input", async () => {
    setupUpdate();
    setupSelect([{ source: null }]);

    const fd = makeFormData({
      id: "7",
      slug: "my-diagram",
      name: "My Diagram",
      type: "diagram",
      content: '{"nodes":[]}',
    });

    await expect(updateKaoObject(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockUpdate).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/objects/my-diagram");
  });

  it("returns { errors } on Zod validation failure", async () => {
    const fd = makeFormData({
      id: "0",        // fails positive()
      slug: "MyDiagram",  // uppercase — invalid
      name: "",
      type: "diagram",
      content: '{}',
    });

    const result = await updateKaoObject(null, fd);
    expect(result).toHaveProperty("errors");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── deleteKaoObject ──────────────────────────────────────────────────────────

describe("deleteKaoObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
  });

  it("calls db.delete and redirects to /admin/objects on valid id and slug", async () => {
    setupDelete();
    setupSelect([{ source: null }]);

    const fd = makeFormData({ id: "3", slug: "old-anim" });

    await expect(deleteKaoObject(fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockDelete).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/objects");
    expect(revalidatePath).toHaveBeenCalledWith("/objects");
    expect(redirect).toHaveBeenCalledWith("/admin/objects");
  });

  it("throws Unauthorized when getSession returns null", async () => {
    mockGetSession.mockResolvedValue(null);

    const fd = makeFormData({ id: "3", slug: "old-anim" });

    await expect(deleteKaoObject(fd)).rejects.toThrow("Unauthorized");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
