// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockSelectFromWhereLimit = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdateSetWhere = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  },
}));

// ─── Auth mock ───────────────────────────────────────────────────────────────

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

// ─── Cookie mock (per-test customizable) ─────────────────────────────────────
// next/headers is already globally mocked in tests/setup.ts but we need
// per-test control of the cookie `set` spy, so we override it here.

const mockCookieSet = vi.hoisted(() => vi.fn());
const mockCookies = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: mockCookies,
  headers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
  };
});

import { revalidatePath } from "next/cache";
import { saveColorSchemePreference, saveTheme } from "@/app/settings/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

function setupSelectLimit(rows: unknown[]) {
  mockSelectFromWhereLimit.mockResolvedValue(rows);
  mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

function setupUpdate() {
  mockUpdateSetWhere.mockResolvedValue(undefined);
  mockUpdateSet.mockReturnValue({ where: mockUpdateSetWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
}

function setupInsert() {
  mockInsertValues.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("saveColorSchemePreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated admin user
    mockGetSession.mockResolvedValue({ userId: 1, email: "admin@example.com", userSlug: "admin", isRootAdmin: true });
    // Default: cookies().set is available
    mockCookies.mockResolvedValue({ set: mockCookieSet });
  });

  it("upserts the DB and sets the color-scheme cookie on a valid 'light' preference (new row)", async () => {
    // No existing theme row
    setupSelectLimit([]);
    setupInsert();

    const fd = makeFormData({ colorSchemePreference: "light" });
    await saveColorSchemePreference(fd);

    // DB insert called
    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();

    // Cookie written with correct name and path
    expect(mockCookieSet).toHaveBeenCalledWith(
      "color-scheme",
      "light",
      expect.objectContaining({ path: "/" })
    );
    // maxAge must be positive
    const [, , opts] = mockCookieSet.mock.calls[0] as [string, string, { maxAge: number; path: string }];
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it("upserts the DB and sets the color-scheme cookie on a valid 'dark' preference (new row)", async () => {
    setupSelectLimit([]);
    setupInsert();

    const fd = makeFormData({ colorSchemePreference: "dark" });
    await saveColorSchemePreference(fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "color-scheme",
      "dark",
      expect.objectContaining({ path: "/" })
    );
  });

  it("upserts the DB and sets the color-scheme cookie on a valid 'system' preference (new row)", async () => {
    setupSelectLimit([]);
    setupInsert();

    const fd = makeFormData({ colorSchemePreference: "system" });
    await saveColorSchemePreference(fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "color-scheme",
      "system",
      expect.objectContaining({ path: "/" })
    );
  });

  it("updates the existing DB row (not inserts) when a theme row already exists", async () => {
    // Existing theme row present
    setupSelectLimit([{ id: 5, userId: 1, colorSchemePreference: "system" }]);
    setupUpdate();

    const fd = makeFormData({ colorSchemePreference: "dark" });
    await saveColorSchemePreference(fd);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "color-scheme",
      "dark",
      expect.objectContaining({ path: "/" })
    );
  });

  it("calls revalidatePath('/') after a successful save", async () => {
    setupSelectLimit([]);
    setupInsert();

    const fd = makeFormData({ colorSchemePreference: "light" });
    await saveColorSchemePreference(fd);

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("throws an error for an invalid preference value", async () => {
    const fd = makeFormData({ colorSchemePreference: "banana" });

    await expect(saveColorSchemePreference(fd)).rejects.toThrow(
      "Invalid color scheme preference"
    );
    // DB and cookie should never be touched
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("throws an error for an empty preference value", async () => {
    const fd = makeFormData({ colorSchemePreference: "" });

    await expect(saveColorSchemePreference(fd)).rejects.toThrow(
      "Invalid color scheme preference"
    );
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("throws 'Not authenticated' when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const fd = makeFormData({ colorSchemePreference: "light" });

    await expect(saveColorSchemePreference(fd)).rejects.toThrow("Not authenticated");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});

// ─── Valid theme tokens fixture ───────────────────────────────────────────────

const VALID_TOKENS: Record<string, string> = {
  background:       "#18181b",
  foreground:       "#f4f4f5",
  muted:            "#27272a",
  mutedForeground:  "#a1a1aa",
  border:           "#3f3f46",
  accent:           "#6366f1",
  accentForeground: "#ffffff",
  link:             "#60a5fa",
  linkHover:        "#93c5fd",
  codeBackground:   "#27272a",
  surface:          "#27272a",
  surfaceHover:     "#3f3f46",
  primaryBtn:       "#2563eb",
  primaryBtnText:   "#ffffff",
  inputBorder:      "#3f3f46",
  inputFocusBorder: "#60a5fa",
  secondaryText:    "#a1a1aa",
};

describe("saveTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: 1, email: "admin@example.com", userSlug: "admin", isRootAdmin: true });
    mockCookies.mockResolvedValue({ set: mockCookieSet });
  });

  it("rejects a malicious color value with 'Invalid theme tokens' and makes no DB call", async () => {
    const fd = makeFormData({
      mode: "light",
      ...VALID_TOKENS,
      // Overwrite one token with a CSS injection payload
      background: "red; } body { background: url(javascript:alert(1)) }",
    });

    await expect(saveTheme(fd)).rejects.toThrow("Invalid theme tokens");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts a valid 17-token submission and calls db.update when a row exists", async () => {
    setupSelectLimit([{ id: 3, userId: 1 }]);
    setupUpdate();

    const fd = makeFormData({ mode: "light", ...VALID_TOKENS });
    await saveTheme(fd);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts a valid 17-token submission and calls db.insert when no row exists", async () => {
    setupSelectLimit([]);
    setupInsert();

    const fd = makeFormData({ mode: "dark", ...VALID_TOKENS });
    await saveTheme(fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid mode value with 'Invalid theme tokens'", async () => {
    const fd = makeFormData({ mode: "rainbow", ...VALID_TOKENS });

    await expect(saveTheme(fd)).rejects.toThrow("Invalid theme tokens");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects url(...) inside a color value", async () => {
    const fd = makeFormData({
      mode: "light",
      ...VALID_TOKENS,
      foreground: "url(https://evil.example/)",
    });

    await expect(saveTheme(fd)).rejects.toThrow("Invalid theme tokens");
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
