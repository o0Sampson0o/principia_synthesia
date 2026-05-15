// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- DB mock ---
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockInnerJoin = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

// --- Auth mock ---
const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

// --- Access mock ---
const mockCanViewBook = vi.hoisted(() => vi.fn());
vi.mock("@/lib/access", () => ({
  canViewBook: mockCanViewBook,
}));

// --- Bundle builder mock ---
const mockBuildBookBundle = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bundle/build-book-bundle", () => ({
  buildBookBundle: mockBuildBookBundle,
}));

// --- License mock — feature enabled by default ---
const mockFeatureEnabled = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock("@/lib/license", () => ({
  getLicenseFromRequest: vi.fn().mockResolvedValue(null),
  featureEnabled: mockFeatureEnabled,
}));

// --- drizzle-orm operators ---
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    asc: vi.fn((col) => ({ _type: "asc", col })),
    inArray: vi.fn((col, vals) => ({ _type: "inArray", col, vals })),
  };
});

import { GET } from "@/app/api/curriculum/[book]/export/bundle/route";

function makeParams(book: string): { params: Promise<{ book: string }> } {
  return { params: Promise.resolve({ book }) };
}

/** Wire up the DB chain for the primary curriculum entries query */
function setupEntriesMock(entries: unknown[]) {
  mockOrderBy.mockResolvedValue(entries);
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

const sampleEntry = {
  bookTitle: "Test Book",
  position: 0,
  partTitle: null,
  title: "Chapter One",
  content: null,
};

describe("GET /api/curriculum/[book]/export/bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
    mockBuildBookBundle.mockResolvedValue(new ArrayBuffer(8));
  });

  it("returns 404 when canViewBook returns false", async () => {
    mockCanViewBook.mockResolvedValue(false);
    setupEntriesMock([]);

    const res = await GET(new Request("http://localhost/api/curriculum/my-book/export/bundle"), makeParams("my-book"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when no curriculum entries exist for the book", async () => {
    mockCanViewBook.mockResolvedValue(true);
    setupEntriesMock([]);

    const res = await GET(new Request("http://localhost/api/curriculum/empty-book/export/bundle"), makeParams("empty-book"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with Content-Type application/zip when entries exist", async () => {
    mockCanViewBook.mockResolvedValue(true);
    setupEntriesMock([sampleEntry]);

    const res = await GET(new Request("http://localhost/api/curriculum/my-book/export/bundle"), makeParams("my-book"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
  });

  it("includes the bookSlug in the Content-Disposition header", async () => {
    mockCanViewBook.mockResolvedValue(true);
    setupEntriesMock([sampleEntry]);

    const res = await GET(new Request("http://localhost/api/curriculum/my-book/export/bundle"), makeParams("my-book"));
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("my-book");
  });
});
