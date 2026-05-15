// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockInnerJoin = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({ db: { select: mockSelect } }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));

const mockBuildSyncBundle = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sync/build-sync-bundle", () => ({
  buildSyncBundle: mockBuildSyncBundle,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    asc: vi.fn((col) => ({ _type: "asc", col })),
  };
});

import { GET } from "@/app/api/curriculum/[book]/export/sync/route";

function makeParams(book: string) {
  return { params: Promise.resolve({ book }) };
}

function setupEntriesMock(entries: unknown[]) {
  mockOrderBy.mockResolvedValue(entries);
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

const sample = {
  bookTitle: "Test",
  position: 0,
  partTitle: null,
  slug: "intro",
  title: "Intro",
  isInternal: false,
  content: "# hi",
  updatedAt: new Date("2026-01-01"),
};

describe("GET /api/curriculum/[book]/export/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSyncBundle.mockResolvedValue(new ArrayBuffer(8));
  });

  it("returns 401 when no admin session", async () => {
    mockGetSession.mockResolvedValue(null);
    setupEntriesMock([sample]); // wouldn't be reached, but safe
    const res = await GET(new Request("http://x/"), makeParams("b"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is non-admin", async () => {
    mockGetSession.mockResolvedValue({ userId: 1, email: "u@x", isAdmin: false });
    setupEntriesMock([sample]);
    const res = await GET(new Request("http://x/"), makeParams("b"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no entries for the book", async () => {
    mockGetSession.mockResolvedValue({ userId: 1, email: "a@x", isAdmin: true });
    setupEntriesMock([]);
    const res = await GET(new Request("http://x/"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with application/zip when entries exist", async () => {
    mockGetSession.mockResolvedValue({ userId: 1, email: "a@x", isAdmin: true });
    setupEntriesMock([sample]);
    const res = await GET(new Request("http://x/"), makeParams("b"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("b-sync.zip");
    expect(mockBuildSyncBundle).toHaveBeenCalledOnce();
  });
});
