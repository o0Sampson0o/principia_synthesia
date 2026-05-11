// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock @/db ---
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());
const mockInnerJoin = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { select: mockSelect },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    asc: vi.fn((col) => ({ _type: "asc", col })),
  };
});

// Mock epub-gen-memory to avoid heavy EPUB generation in tests
vi.mock("epub-gen-memory", () => ({
  default: vi.fn(async (_options: any, _chapters: any) => {
    // Return a minimal buffer that looks like an EPUB (a zip file)
    return Buffer.from("PK\x03\x04fake epub zip content for test");
  }),
}));

import { GET } from "@/app/api/curriculum/[book]/export/epub/route";

function makeParams(book: string) {
  return { params: Promise.resolve({ book }) };
}

function setupDbMock(rows: any[]) {
  mockOrderBy.mockResolvedValue(rows);
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("GET /api/curriculum/[book]/export/epub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the book has no entries", async () => {
    setupDbMock([]);
    const res = await GET(new Request("http://localhost/api/curriculum/missing/export/epub"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 404 body text 'Book not found' when no entries", async () => {
    setupDbMock([]);
    const res = await GET(new Request("http://localhost/api/curriculum/missing/export/epub"), makeParams("missing"));
    const text = await res.text();
    expect(text).toContain("Book not found");
  });

  it("returns Content-Type: application/epub+zip for a valid book", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "Hello world" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/epub"), makeParams("test-book"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
  });

  it("returns Content-Disposition attachment with book slug as filename", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "Hello world" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/my-book/export/epub"), makeParams("my-book"));
    const cd = res.headers.get("content-disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain("my-book.epub");
  });

  it("returns a non-empty response body for a valid book", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "Hello world" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/epub"), makeParams("test-book"));
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("returns Cache-Control: no-store", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/epub"), makeParams("test-book"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("handles null content gracefully", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Empty Chapter", content: null },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/epub"), makeParams("test-book"));
    expect(res.status).toBe(200);
  });
});
