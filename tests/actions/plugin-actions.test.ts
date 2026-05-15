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

import { scanAndInstallPlugins, uninstallPlugin } from "@/app/admin/animations/plugins/actions";

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

describe("scanAndInstallPlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAnimationScript.mockReturnValue({ ok: true });
  });

  it("returns { error } when session is not admin", async () => {
    setupNonAdminSession();
    const result = await scanAndInstallPlugins();
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns { error } when session is null", async () => {
    setupNoSession();
    const result = await scanAndInstallPlugins();
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns { warning } when plugins dir does not exist", async () => {
    setupAdminSession();
    mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await scanAndInstallPlugins();
    expect(result).toEqual({ warning: "plugins/animations/ directory not found" });
  });

  it("skips directory with no manifest.json", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["no-manifest"]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    const result = await scanAndInstallPlugins();
    expect(result).toMatchObject({
      installed: [],
      skipped: [{ slug: "no-manifest", reason: "manifest.json not found" }],
    });
  });

  it("skips directory with invalid JSON in manifest", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["bad-json"]);
    mockReadFile.mockResolvedValue("{ invalid json }");
    const result = await scanAndInstallPlugins();
    expect(result).toMatchObject({
      installed: [],
      skipped: [{ slug: "bad-json", reason: "manifest.json is invalid JSON" }],
    });
  });

  it("skips directory when slug doesn't match directory name", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["my-dir"]);
    mockReadFile.mockResolvedValue(
      JSON.stringify({ slug: "different-slug", name: "X", version: "1.0.0", entrypoint: "a.js" })
    );
    const result = await scanAndInstallPlugins();
    expect(result).toMatchObject({
      installed: [],
      skipped: [
        expect.objectContaining({
          slug: "my-dir",
          reason: expect.stringContaining("does not match directory name"),
        }),
      ],
    });
  });

  it("skips directory when entrypoint file is missing", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    // First readFile call (manifest.json) succeeds; second (animation.js) fails
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockRejectedValueOnce(new Error("ENOENT"));
    const result = await scanAndInstallPlugins();
    expect(result).toMatchObject({
      installed: [],
      skipped: [{ slug: "test-plugin", reason: 'Entrypoint "animation.js" not found' }],
    });
  });

  it("skips directory when validateAnimationScript returns ok: false", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce("eval('bad')");
    mockValidateAnimationScript.mockReturnValue({ ok: false, reason: "eval is not allowed" });
    const result = await scanAndInstallPlugins();
    expect(result).toMatchObject({
      installed: [],
      skipped: [
        expect.objectContaining({
          slug: "test-plugin",
          reason: expect.stringContaining("eval is not allowed"),
        }),
      ],
    });
  });

  it("calls db.insert for a new valid plugin", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce(VALID_CODE);
    setupSelectNoExisting();
    setupInsert();

    const result = await scanAndInstallPlugins();

    expect(result).toMatchObject({ installed: ["test-plugin"], skipped: [] });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "test-plugin", source: "plugin" })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls db.update for an existing plugin", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST)
      .mockResolvedValueOnce(VALID_CODE);
    setupSelectExisting();
    setupUpdate();

    const result = await scanAndInstallPlugins();

    expect(result).toMatchObject({ installed: ["test-plugin"], skipped: [] });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ source: "plugin" })
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("handles multiple plugins, installing some and skipping others", async () => {
    setupAdminSession();
    mockReaddir.mockResolvedValue(["test-plugin", "bad-json-dir"]);
    mockReadFile
      .mockResolvedValueOnce(VALID_MANIFEST) // test-plugin manifest
      .mockResolvedValueOnce(VALID_CODE)     // test-plugin code
      .mockResolvedValueOnce("{ broken");    // bad-json-dir manifest (bad JSON)

    setupSelectNoExisting();
    setupInsert();

    const result = await scanAndInstallPlugins();

    expect(result).toMatchObject({
      installed: ["test-plugin"],
      skipped: [{ slug: "bad-json-dir", reason: "manifest.json is invalid JSON" }],
    });
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
