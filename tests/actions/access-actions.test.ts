// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertValuesOnConflict = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFromWhereLimit = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateSetWhere = vi.hoisted(() => vi.fn());
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
    and: vi.fn((...args) => ({ _type: "and", args })),
    inArray: vi.fn((col, vals) => ({ _type: "inArray", col, vals })),
  };
});

// Mock getSession and hashPassword from lib/auth
const mockGetSession = vi.hoisted(() => vi.fn());
const mockHashPassword = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  hashPassword: mockHashPassword,
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  setResourceVisibility,
  addAccessGrant,
  removeAccessGrant,
  createOrganization,
  deleteOrganization,
  addOrgMember,
  removeOrgMember,
  createUser,
} from "@/app/admin/access/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

function setupAdminSession() {
  mockGetSession.mockResolvedValue({ userId: 1, email: "admin@example.com", isAdmin: true });
}

function setupNonAdminSession() {
  mockGetSession.mockResolvedValue({ userId: 2, email: "user@example.com", isAdmin: false });
}

function setupSelect(rows: any[]) {
  mockSelectFromWhereLimit.mockResolvedValue(rows);
  mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

function setupInsert() {
  mockInsertValues.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

function setupInsertOnConflict() {
  mockInsertValuesOnConflict.mockResolvedValue(undefined);
  mockInsertValues.mockReturnValue({ onConflictDoNothing: mockInsertValuesOnConflict });
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

// ─── setResourceVisibility ────────────────────────────────────────────────────

describe("setResourceVisibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    const fd = makeFormData({ resourceType: "book", resourceKey: "my-book", isPrivate: "true" });
    await expect(setResourceVisibility(fd)).rejects.toThrow("Unauthorized");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("inserts a new visibility row when one doesn't exist", async () => {
    setupAdminSession();
    // select: no existing row
    setupSelect([]);
    // insert
    setupInsert();

    const fd = makeFormData({ resourceType: "book", resourceKey: "my-book", isPrivate: "true" });
    await setResourceVisibility(fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/curriculum/my-book");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/curriculum/my-book/access");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("updates an existing visibility row", async () => {
    setupAdminSession();
    setupSelect([{ id: 5 }]); // existing row
    setupUpdate();

    const fd = makeFormData({ resourceType: "book", resourceKey: "my-book", isPrivate: "false" });
    await setResourceVisibility(fd);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("revalidates article path for article resource type", async () => {
    setupAdminSession();
    setupSelect([]);
    setupInsert();

    const fd = makeFormData({ resourceType: "article", resourceKey: "my-slug", isPrivate: "true" });
    await setResourceVisibility(fd);

    expect(revalidatePath).toHaveBeenCalledWith("/my-slug");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("throws ZodError for invalid resourceType", async () => {
    setupAdminSession();
    const fd = makeFormData({ resourceType: "invalid", resourceKey: "x", isPrivate: "true" });
    await expect(setResourceVisibility(fd)).rejects.toThrow();
  });
});

// ─── addAccessGrant ───────────────────────────────────────────────────────────

describe("addAccessGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    const fd = makeFormData({
      resourceType: "book", resourceKey: "my-book", granteeType: "user", granteeId: "2",
    });
    await expect(addAccessGrant(fd)).rejects.toThrow("Unauthorized");
  });

  it("inserts a grant with onConflictDoNothing", async () => {
    setupAdminSession();
    setupInsertOnConflict();

    const fd = makeFormData({
      resourceType: "book", resourceKey: "my-book", granteeType: "user", granteeId: "2",
    });
    await addAccessGrant(fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValuesOnConflict).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/curriculum/my-book/access");
  });

  it("does not revalidatePath for article grants", async () => {
    setupAdminSession();
    setupInsertOnConflict();

    const fd = makeFormData({
      resourceType: "article", resourceKey: "my-article", granteeType: "user", granteeId: "2",
    });
    await addAccessGrant(fd);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("throws ZodError for invalid granteeId", async () => {
    setupAdminSession();
    const fd = makeFormData({
      resourceType: "book", resourceKey: "my-book", granteeType: "user", granteeId: "not-a-number",
    });
    await expect(addAccessGrant(fd)).rejects.toThrow();
  });
});

// ─── removeAccessGrant ────────────────────────────────────────────────────────

describe("removeAccessGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    await expect(removeAccessGrant(makeFormData({ grantId: "1" }))).rejects.toThrow("Unauthorized");
  });

  it("deletes the grant and revalidates book path", async () => {
    setupAdminSession();
    setupSelect([{ resourceType: "book", resourceKey: "my-book" }]);
    setupDelete();

    await removeAccessGrant(makeFormData({ grantId: "5" }));

    expect(mockDelete).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/curriculum/my-book/access");
  });

  it("deletes the grant without revalidating for article grants", async () => {
    setupAdminSession();
    setupSelect([{ resourceType: "article", resourceKey: "my-article" }]);
    setupDelete();

    await removeAccessGrant(makeFormData({ grantId: "5" }));

    expect(mockDelete).toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ─── createOrganization ───────────────────────────────────────────────────────

describe("createOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    await expect(
      createOrganization(makeFormData({ name: "My Org", slug: "my-org" }))
    ).rejects.toThrow("Unauthorized");
  });

  it("inserts org, revalidates, and redirects", async () => {
    setupAdminSession();
    setupInsert();

    await expect(
      createOrganization(makeFormData({ name: "My Org", slug: "my-org" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/access/orgs");
    expect(redirect).toHaveBeenCalledWith("/admin/access/orgs/my-org");
  });

  it("throws ZodError for invalid slug format", async () => {
    setupAdminSession();
    await expect(
      createOrganization(makeFormData({ name: "Org", slug: "INVALID SLUG" }))
    ).rejects.toThrow();
  });
});

// ─── deleteOrganization ───────────────────────────────────────────────────────

describe("deleteOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    await expect(
      deleteOrganization(makeFormData({ orgId: "1" }))
    ).rejects.toThrow("Unauthorized");
  });

  it("deletes grants for the org, deletes org, and redirects", async () => {
    setupAdminSession();
    // delete access_grants for org, then delete org
    let deleteCallCount = 0;
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockImplementation(() => ({ where: mockDeleteWhere }));

    await expect(
      deleteOrganization(makeFormData({ orgId: "3" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockDelete).toHaveBeenCalledTimes(2); // grants + org
    expect(revalidatePath).toHaveBeenCalledWith("/admin/access/orgs");
    expect(redirect).toHaveBeenCalledWith("/admin/access/orgs");
  });
});

// ─── addOrgMember ─────────────────────────────────────────────────────────────

describe("addOrgMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    await expect(
      addOrgMember(makeFormData({ orgId: "1", userId: "2", role: "member" }))
    ).rejects.toThrow("Unauthorized");
  });

  it("inserts membership and revalidates org page", async () => {
    setupAdminSession();

    // Insert membership (onConflictDoNothing)
    mockInsertValuesOnConflict.mockResolvedValue(undefined);
    mockInsertValues.mockReturnValue({ onConflictDoNothing: mockInsertValuesOnConflict });
    mockInsert.mockReturnValue({ values: mockInsertValues });

    // Select org slug
    setupSelect([{ slug: "my-org" }]);

    await addOrgMember(makeFormData({ orgId: "1", userId: "2", role: "member" }));

    expect(mockInsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/access/orgs/my-org");
  });

  it("throws ZodError for invalid role", async () => {
    setupAdminSession();
    await expect(
      addOrgMember(makeFormData({ orgId: "1", userId: "2", role: "superuser" }))
    ).rejects.toThrow();
  });
});

// ─── removeOrgMember ──────────────────────────────────────────────────────────

describe("removeOrgMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    await expect(
      removeOrgMember(makeFormData({ membershipId: "1" }))
    ).rejects.toThrow("Unauthorized");
  });

  it("deletes membership and revalidates org page", async () => {
    setupAdminSession();

    // Two select calls: one for membership orgId, one for org slug
    let selectCount = 0;
    mockSelect.mockImplementation(() => {
      selectCount++;
      const mockFrom = vi.fn();
      const mockWhere = vi.fn();
      const mockLimit = vi.fn();
      if (selectCount === 1) {
        // membership lookup
        mockLimit.mockResolvedValue([{ orgId: 1 }]);
        mockWhere.mockReturnValue({ limit: mockLimit });
        mockFrom.mockReturnValue({ where: mockWhere });
      } else {
        // org slug lookup
        mockLimit.mockResolvedValue([{ slug: "my-org" }]);
        mockWhere.mockReturnValue({ limit: mockLimit });
        mockFrom.mockReturnValue({ where: mockWhere });
      }
      return { from: mockFrom };
    });

    setupDelete();

    await removeOrgMember(makeFormData({ membershipId: "5" }));

    expect(mockDelete).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/access/orgs/my-org");
  });
});

// ─── createUser ───────────────────────────────────────────────────────────────

describe("createUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized for non-admin session", async () => {
    setupNonAdminSession();
    await expect(
      createUser(makeFormData({ email: "user@example.com", password: "password123" }))
    ).rejects.toThrow("Unauthorized");
  });

  it("hashes password, inserts user, and revalidates", async () => {
    setupAdminSession();
    mockHashPassword.mockResolvedValue("hashed-password");
    setupInsert();

    await createUser(makeFormData({ email: "new@example.com", password: "password123" }));

    expect(mockHashPassword).toHaveBeenCalledWith("password123");
    expect(mockInsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/access/users");
  });

  it("throws ZodError for invalid email", async () => {
    setupAdminSession();
    await expect(
      createUser(makeFormData({ email: "not-an-email", password: "password123" }))
    ).rejects.toThrow();
  });

  it("throws ZodError for password too short", async () => {
    setupAdminSession();
    await expect(
      createUser(makeFormData({ email: "user@example.com", password: "short" }))
    ).rejects.toThrow();
  });
});
