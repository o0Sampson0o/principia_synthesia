// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock renderBookHtml so tests don't run the real renderer + Playwright
vi.mock("@/lib/pdf/render-book-html", () => ({
  renderBookHtml: vi.fn().mockResolvedValue("<html><body>Test Book PDF</body></html>"),
}));

// Mock playwright to avoid launching a real browser in tests
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake pdf content for test")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

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

import { GET } from "@/app/api/curriculum/[book]/export/pdf/route";

function makeParams(book: string) {
  return { params: Promise.resolve({ book }) };
}

function setupDbMock(rows: unknown[]) {
  mockOrderBy.mockResolvedValue(rows);
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("GET /api/curriculum/[book]/export/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the book has no entries", async () => {
    setupDbMock([]);
    const res = await GET(new Request("http://localhost/api/curriculum/missing/export/pdf"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 404 body text 'Book not found' when no entries", async () => {
    setupDbMock([]);
    const res = await GET(new Request("http://localhost/api/curriculum/missing/export/pdf"), makeParams("missing"));
    const text = await res.text();
    expect(text).toContain("Book not found");
  });

  it("returns Content-Type: application/pdf for a valid book", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "Hello world" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/pdf"), makeParams("test-book"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns Content-Disposition attachment with book slug as filename", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "Hello world" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/my-book/export/pdf"), makeParams("my-book"));
    const cd = res.headers.get("content-disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain("my-book.pdf");
  });

  it("returns a non-empty response body for a valid book", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "Hello world" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/pdf"), makeParams("test-book"));
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("returns Cache-Control: no-store", async () => {
    setupDbMock([
      { bookTitle: "Test Book", position: 0, partTitle: null, title: "Chapter 1", content: "" },
    ]);
    const res = await GET(new Request("http://localhost/api/curriculum/test-book/export/pdf"), makeParams("test-book"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("calls renderBookHtml with book title and entries", async () => {
    const { renderBookHtml } = await import("@/lib/pdf/render-book-html");
    setupDbMock([
      { bookTitle: "My Book", position: 0, partTitle: "Part I", title: "Ch 1", content: "Content 1" },
      { bookTitle: "My Book", position: 1, partTitle: null, title: "Ch 2", content: "Content 2" },
    ]);
    await GET(new Request("http://localhost/api/curriculum/my-book/export/pdf"), makeParams("my-book"));
    expect(renderBookHtml).toHaveBeenCalledWith("My Book", expect.arrayContaining([
      expect.objectContaining({ title: "Ch 1", partTitle: "Part I" }),
      expect.objectContaining({ title: "Ch 2" }),
    ]));
  });

  it("closes the browser even if pdf() throws", async () => {
    const { chromium } = await import("playwright");
    const mockClose = vi.fn().mockResolvedValue(undefined);
    (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockRejectedValue(new Error("pdf failed")),
      }),
      close: mockClose,
    });
    setupDbMock([
      { bookTitle: "Test", position: 0, partTitle: null, title: "Ch", content: "" },
    ]);
    await expect(
      GET(new Request("http://localhost/api/curriculum/test/export/pdf"), makeParams("test"))
    ).rejects.toThrow("pdf failed");
    expect(mockClose).toHaveBeenCalled();
  });
});
