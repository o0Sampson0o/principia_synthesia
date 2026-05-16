// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── fs/promises mock ─────────────────────────────────────────────────────────
const mockReaddir = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());

vi.mock("fs/promises", () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelectFromWhereLimit = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdateSetWhere = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────
const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// ─── validate-animation mock ──────────────────────────────────────────────────
const mockValidateAnimationScript = vi.hoisted(() => vi.fn());

vi.mock("@/lib/validate-animation", () => ({
  validateAnimationScript: mockValidateAnimationScript,
}));

// ─── drizzle-orm mock ─────────────────────────────────────────────────────────
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    and: vi.fn((...conds) => ({ _type: "and", conds })),
    asc: vi.fn((col) => ({ _type: "asc", col })),
  };
});

import { scanPlugins, installPlugin, uninstallPlugin } from "@/app/admin/objects/plugins/actions";
import { revalidatePath } from "next/cache";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_MANIFEST = JSON.stringify({
  slug: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  description: "A test plugin",
  entrypoint: "animation.js",
});

const VALID_CODE = `(function myAnim() {
  var canvas = document.getElementById("canvas");
})();`;

function setupAdminSession() {
  mockGetSession.mockResolvedValue({ userId: 1, email: "admin@example.com", isAdmin: true });
}

function setupNonAdminSession() {
  mockGetSession.mockResolvedValue({ userId: 2, email: "user@example.com", isAdmin: false });
}

function setupNoSession() {
  mockGetSession.mockResolvedValue(null);
}

/**
 * Sets up the bulk-select chain used by scanPlugins to fetch all installed rows.
 * scanPlugins does: db.select(...).from(objects).where(and(...))  (no .limit)
 */
function setupBulkSelectInstalled(rows: { slug: string; pluginMeta: unknown }[]) {
  mockSelectFromWhere.mockResolvedValue(rows);
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

/**
 * Sets up the per-plugin select chain used by installPlugin.
 * installPlugin does: db.select(...).from(objects).where(and(...)).limit(1)
 */
function setupSelectNoExisting() {
  mockSelectFromWhereLimit.mockResolvedValue([]);
  mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

function setupSelectExisting() {
  mockSelectFromWhereLimit.mockResolvedValue([{ id: 42 }]);
  mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

function setupInsert() {
  mockInsertValues.mockResolvedValue(undefined);
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scanPlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAnimationScript.mockReturnValue({ ok: true });
  });

  it("returns { error } when session is not admin", async () => {
    setupNonAdminSession();
    const result = await scanPlugins();
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns { error } when session is null", async () => {
    setupNoSession();
    const result = await scanPlugins();
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns { warning } when plugins dir does not exist", async () => {
    setupAdminSession();
    mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await scanPlugins();
    expect(result).toEqual({ warning: "plugins/animations/ directory not found" });
  });

  it("returns not_installed status for a plugin not in the DB", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce(VALID_CODE);
    setupBulkSelectInstalled([]);

    const result = await scanPlugins();
    expect(result).toMatchObject({
      plugins: [expect.objectContaining({ slug: "test-plugin", status: "not_installed" })],
      skipped: [],
    });
  });

  it("returns installed status when DB version matches manifest version", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce(VALID_CODE);
    setupBulkSelectInstalled([{ slug: "test-plugin", pluginMeta: { version: "1.0.0" } }]);

    const result = await scanPlugins();
    expect(result).toMatchObject({
      plugins: [expect.objectContaining({ slug: "test-plugin", status: "installed" })],
      skipped: [],
    });
  });

  it("returns update_available status when DB version differs from manifest version", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)  // version: "1.0.0"
      .mockResolvedValueOnce(VALID_CODE);
    setupBulkSelectInstalled([{ slug: "test-plugin", pluginMeta: { version: "0.9.0" } }]);

    const result = await scanPlugins();
    expect(result).toMatchObject({
      plugins: [expect.objectContaining({ slug: "test-plugin", status: "update_available" })],
      skipped: [],
    });
  });

  it("skips directory with invalid manifest", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["bad-json"]);
    mockReadFile.mockResolvedValue("{ invalid json }");
    setupBulkSelectInstalled([]);

    const result = await scanPlugins();
    expect(result).toMatchObject({
      plugins: [],
      skipped: [{ slug: "bad-json", reason: "manifest.json is invalid JSON" }],
    });
  });

  it("skips directory when manifest.json is missing", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["no-manifest"]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    setupBulkSelectInstalled([]);

    const result = await scanPlugins();
    expect(result).toMatchObject({
      plugins: [],
      skipped: [{ slug: "no-manifest", reason: "manifest.json not found" }],
    });
  });
});

describe("installPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAnimationScript.mockReturnValue({ ok: true });
  });

  it("returns { error } when session is not admin", async () => {
    setupNonAdminSession();
    const result = await installPlugin("test-plugin");
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("inserts a new row when plugin is not in DB and calls revalidatePath", async () => {
    setupAdminSession();
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce(VALID_CODE);
    setupSelectNoExisting();
    setupInsert();

    const result = await installPlugin("test-plugin");

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "test-plugin", source: "plugin" })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/objects/plugins");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/objects");
  });

  it("updates an existing row when plugin is already in DB", async () => {
    setupAdminSession();
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce(VALID_CODE);
    setupSelectExisting();
    setupUpdate();

    const result = await installPlugin("test-plugin");

    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ source: "plugin" })
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns { error } when plugin directory is not found", async () => {
    setupAdminSession();
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await installPlugin("nonexistent-plugin");
    expect(result).toEqual({ error: "manifest.json not found" });
  });
});

describe("uninstallPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { error } when session is not admin", async () => {
    setupNonAdminSession();
    const result = await uninstallPlugin("test-plugin");
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("calls db.delete with slug and source=plugin condition", async () => {
    setupAdminSession();
    setupDelete();

    const result = await uninstallPlugin("test-plugin");

    expect(result).toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("returns { ok: true } even if slug does not exist", async () => {
    setupAdminSession();
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    const result = await uninstallPlugin("nonexistent");
    expect(result).toEqual({ ok: true });
  });
});
