// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────
// Drizzle query chains: db.select().from().where().limit() etc.
// Each step returns the builder; the terminal step returns a promise.
// We use mockReturnThis() for chainable steps and mockResolvedValue() for terminals.

const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFromWhereLimit = vi.hoisted(() => vi.fn());
const mockSelectFromWhereOrderBy = vi.hoisted(() => vi.fn());
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

// Mock drizzle-orm operators
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    inArray: vi.fn((col, vals) => ({ _type: "inArray", col, vals })),
    asc: vi.fn((col) => ({ _type: "asc", col })),
  };
});

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createArticle,
  updateArticle,
  deleteArticle,
  setArticleCategories,
  saveAnimation,
} from "@/app/admin/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

/** Set up a full DB mock chain for the given terminal resolve value */
function setupInsert(resolvedRows: any[] = [{ id: 1, slug: "test", title: "Test" }]) {
  mockInsertReturning.mockResolvedValue(resolvedRows);
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

function setupInsertNoReturn(resolvedValue: any = undefined) {
  mockInsertValues.mockResolvedValue(resolvedValue);
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

function setupSelect(rows: any[]) {
  mockSelectFromWhereLimit.mockResolvedValue(rows);
  mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
  mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
  mockSelect.mockReturnValue({ from: mockSelectFrom });
}

function setupSelectWithoutWhere(rows: any[]) {
  // For queries without .where() — e.g. categories.select().from()
  mockSelectFrom.mockResolvedValue(rows);
  mockSelect.mockReturnValue({ from: mockSelectFrom });
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

describe("createArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts an article, sets categories, calls revalidatePath, then redirects", async () => {
    // 1. db.insert(articles).values(...).returning() → article
    mockInsertReturning.mockResolvedValueOnce([{ id: 42, slug: "my-article", title: "My Article" }]);
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsert.mockReturnValue({ values: mockInsertValues });

    // 2. setArticleCategories with empty slugs → db.delete(articleCategories).where(...)
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    const fd = makeFormData({
      title: "My Article",
      slug: "my-article",
      summary: "A summary",
      content: "# Hello",
      categories: "",
    });

    await expect(createArticle(fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockInsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(redirect).toHaveBeenCalledWith("/my-article");
  });

  it("sets categories by inserting into articleCategories when categories are provided", async () => {
    // Insert article
    mockInsertReturning.mockResolvedValueOnce([{ id: 7, slug: "physics", title: "Physics" }]);
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });

    // For setArticleCategories:
    // 1. select categories where inArray(slug, ['math', 'science']) → existing cats
    // 2. insert missing categories → new cats
    // 3. delete articleCategories → ok
    // 4. insert articleCategories → ok

    let insertCallCount = 0;
    mockInsert.mockImplementation(() => ({
      values: (vals: any) => {
        insertCallCount++;
        if (insertCallCount === 1) {
          // First insert: articles
          return { returning: () => Promise.resolve([{ id: 7, slug: "physics", title: "Physics" }]) };
        }
        if (insertCallCount === 2) {
          // Second insert: new categories
          return { returning: () => Promise.resolve([{ id: 10, slug: "math", name: "math" }, { id: 11, slug: "science", name: "science" }]) };
        }
        // Third insert: articleCategories (no returning)
        return Promise.resolve(undefined);
      },
    }));

    mockSelectFromWhere.mockResolvedValue([]); // no existing categories
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    const fd = makeFormData({
      title: "Physics",
      slug: "physics",
      summary: "",
      content: "",
      categories: "math,science",
    });

    await expect(createArticle(fd)).rejects.toThrow("NEXT_REDIRECT");
    // Verify insert was called for article + categories
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("updateArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a revision, updates the article, and redirects", async () => {
    // select current article for revision
    mockSelectFromWhereLimit.mockResolvedValueOnce([
      { id: 5, slug: "existing", content: "Old content" },
    ]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // insert revision
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });

    // update article
    mockUpdateSetWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({ where: mockUpdateSetWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    // setArticleCategories with empty slugs → delete
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    const fd = makeFormData({
      id: "5",
      title: "Updated Title",
      slug: "existing",
      summary: "Summary",
      content: "New content",
      editNote: "Minor update",
      categories: "",
    });

    await expect(updateArticle(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockInsert).toHaveBeenCalled(); // revision insert
    expect(mockUpdate).toHaveBeenCalled(); // article update
    expect(redirect).toHaveBeenCalledWith("/existing");
  });

  it("returns { error } without throwing on Zod validation failure", async () => {
    const fd = makeFormData({
      id: "not-a-number",  // invalid
      title: "",           // required but empty
      slug: "INVALID SLUG WITH SPACES",  // invalid format
      summary: "",
      content: "",
      categories: "",
    });

    const result = await updateArticle(null, fd);
    expect(result).toBeDefined();
    expect(result).toHaveProperty("error");
    // Should not redirect
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns { error } for missing title", async () => {
    const fd = makeFormData({
      id: "1",
      title: "",  // empty — fails min(1)
      slug: "valid-slug",
      summary: "",
      content: "",
      categories: "",
    });

    const result = await updateArticle(null, fd);
    expect(result).toHaveProperty("error");
    expect(result!.error).toHaveProperty("title");
  });

  it("calls revalidatePath for the article slug on success", async () => {
    mockSelectFromWhereLimit.mockResolvedValueOnce([
      { id: 3, slug: "the-slug", content: "Old" },
    ]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockUpdateSetWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({ where: mockUpdateSetWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    const fd = makeFormData({
      id: "3",
      title: "The Article",
      slug: "the-slug",
      summary: "",
      content: "New content",
      categories: "",
    });

    await expect(updateArticle(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(revalidatePath).toHaveBeenCalledWith("/the-slug");
  });
});

describe("deleteArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the article (cascades handle revisions/entries) and redirects to /", async () => {
    // select to check isInternal
    setupSelect([{ isInternal: false, parentBookSlug: null }]);
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    const fd = makeFormData({ id: "10", slug: "doomed-article" });

    await expect(deleteArticle(fd)).rejects.toThrow("NEXT_REDIRECT");

    // delete called once — DB cascades handle revisions and curriculum entries
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("setArticleCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes all links when given an empty slug list", async () => {
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    await setArticleCategories(1, []);

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/category");
  });

  it("does NOT insert new categories when all slugs already exist", async () => {
    // All categories exist
    mockSelectFromWhere.mockResolvedValue([
      { id: 1, slug: "math", name: "math" },
      { id: 2, slug: "physics", name: "physics" },
    ]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // delete + insert articleCategories
    let insertCall = 0;
    mockInsert.mockImplementation(() => ({
      values: (vals: any) => {
        insertCall++;
        return Promise.resolve(undefined);
      },
    }));
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    await setArticleCategories(5, ["math", "physics"]);

    // insert should only be called once (for articleCategories), NOT for new categories
    expect(insertCall).toBe(1);
  });

  it("inserts new categories when a slug is new", async () => {
    // No existing categories
    mockSelectFromWhere.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    let insertCalls: any[][] = [];
    mockInsert.mockImplementation(() => ({
      values: (vals: any) => {
        insertCalls.push(vals);
        return {
          returning: () => Promise.resolve([{ id: 99, slug: "new-cat", name: "new-cat" }]),
        };
      },
    }));
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    await setArticleCategories(5, ["new-cat"]);

    // Should have inserted new category and then articleCategories link
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
    // First insert: the category
    expect(insertCalls[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "new-cat" }),
    ]));
  });

  it("replaces all category links (deletes then inserts)", async () => {
    mockSelectFromWhere.mockResolvedValue([{ id: 3, slug: "existing", name: "existing" }]);
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    await setArticleCategories(7, ["existing"]);

    // delete called once for replacing links
    expect(mockDelete).toHaveBeenCalled();
    // insert called for articleCategories
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("saveAnimation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new animation when slug does not exist", async () => {
    // select: not found
    mockSelectFromWhereLimit.mockResolvedValue([]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // insert
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });

    const fd = makeFormData({ slug: "new-anim", name: "New Animation", code: "function A() {}" });
    await saveAnimation(fd);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/animations");
    expect(revalidatePath).toHaveBeenCalledWith("/animations");
  });

  it("updates an existing animation when slug exists", async () => {
    // select: found
    mockSelectFromWhereLimit.mockResolvedValue([{ id: 5, slug: "existing-anim", name: "Old Name", code: "old code" }]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // update
    mockUpdateSetWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({ where: mockUpdateSetWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    const fd = makeFormData({ slug: "existing-anim", name: "New Name", code: "function B() {}" });
    await saveAnimation(fd);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/animations");
  });

  it("does nothing when slug is empty", async () => {
    const fd = makeFormData({ slug: "", name: "Name", code: "function A() {}" });
    await saveAnimation(fd);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when name is empty", async () => {
    const fd = makeFormData({ slug: "slug", name: "", code: "function A() {}" });
    await saveAnimation(fd);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when code is empty", async () => {
    const fd = makeFormData({ slug: "slug", name: "Name", code: "" });
    await saveAnimation(fd);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
