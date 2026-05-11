// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// Mock renderBookHtml so tests don't run the real renderer + Playwright
vi.mock("@/lib/pdf/render-book-html", () => ({
  renderBookHtml: vi.fn().mockResolvedValue("<html><body>Test Book PDF</body></html>"),
}));

// Mock playwright-core and @sparticuz/chromium to avoid launching a real browser in tests
vi.mock("playwright-core", () => ({
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

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: [],
    executablePath: vi.fn().mockResolvedValue("/usr/bin/chromium"),
    headless: true,
  },
}));

// --- Mock @/db ---
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockInnerJoin = vi.hoisted(() => vi.fn());
const mockCacheWhere = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { select: mockSelect, delete: mockDelete, insert: mockInsert },
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
  mockInnerJoin.mockReturnValue({ where: mockCacheWhere });
  mockCacheWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin, where: mockCacheWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockLimit.mockResolvedValue([]);
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
  mockDeleteWhere.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockResolvedValue(undefined);
}

/**
 * Set up PDF cache mock so the route finds a valid cached entry
 * and skips generation. The hash is computed from the same entries
 * the route will see.
 */
function setupCacheHit(
  rows: Array<Record<string, unknown>>,
  pdfData: string,
) {
  const bookTitle = String(rows[0]?.bookTitle ?? "");
  const hash = createHash("sha256")
    .update(JSON.stringify({ bookTitle, entries: rows }))
    .digest("hex");
  mockLimit.mockResolvedValue([
    { bookSlug: "ignored", contentHash: hash, pdfData },
  ]);
}

describe("GET /api/curriculum/[book]/export/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the book has no entries", async () => {
    setupDbMock([]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/missing/export/pdf"),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 body text 'Book not found' when no entries", async () => {
    setupDbMock([]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/missing/export/pdf"),
      makeParams("missing"),
    );
    const text = await res.text();
    expect(text).toContain("Book not found");
  });

  it("returns Content-Type: application/pdf for a valid book", async () => {
    setupDbMock([
      {
        bookTitle: "Test Book",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Chapter 1",
        content: "Hello world",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/test-book/export/pdf"),
      makeParams("test-book"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns Content-Disposition attachment with book slug as filename", async () => {
    setupDbMock([
      {
        bookTitle: "Test Book",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Chapter 1",
        content: "Hello world",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/my-book/export/pdf"),
      makeParams("my-book"),
    );
    const cd = res.headers.get("content-disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain("my-book.pdf");
  });

  it("returns a non-empty response body for a valid book", async () => {
    setupDbMock([
      {
        bookTitle: "Test Book",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Chapter 1",
        content: "Hello world",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/test-book/export/pdf"),
      makeParams("test-book"),
    );
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("returns Cache-Control: no-store", async () => {
    setupDbMock([
      {
        bookTitle: "Test Book",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Chapter 1",
        content: "",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/test-book/export/pdf"),
      makeParams("test-book"),
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("calls renderBookHtml with book title and entries (cache miss)", async () => {
    const { renderBookHtml } = await import("@/lib/pdf/render-book-html");
    setupDbMock([
      {
        bookTitle: "My Book",
        articleId: 1,
        position: 0,
        partTitle: "Part I",
        title: "Ch 1",
        content: "Content 1",
      },
      {
        bookTitle: "My Book",
        articleId: 2,
        position: 1,
        partTitle: null,
        title: "Ch 2",
        content: "Content 2",
      },
    ]);
    await GET(
      new Request("http://localhost/api/curriculum/my-book/export/pdf"),
      makeParams("my-book"),
    );
    expect(renderBookHtml).toHaveBeenCalledWith(
      "My Book",
      expect.arrayContaining([
        expect.objectContaining({ title: "Ch 1", partTitle: "Part I" }),
        expect.objectContaining({ title: "Ch 2" }),
      ]),
    );
  });

  it("closes the browser even if pdf() throws", async () => {
    const { chromium } = await import("playwright-core");
    const mockClose = vi.fn().mockResolvedValue(undefined);
    (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockRejectedValue(new Error("pdf failed")),
      }),
      close: mockClose,
    });
    setupDbMock([
      {
        bookTitle: "Test",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Ch",
        content: "",
      },
    ]);
    await expect(
      GET(
        new Request("http://localhost/api/curriculum/test/export/pdf"),
        makeParams("test"),
      ),
    ).rejects.toThrow("pdf failed");
    expect(mockClose).toHaveBeenCalled();
  });

  // --- Cache tests ---

  it("returns cached PDF when content hash matches (cache hit)", async () => {
    const { renderBookHtml } = await import("@/lib/pdf/render-book-html");
    const { chromium } = await import("playwright-core");
    const rows = [
      {
        bookTitle: "Cached Book",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Ch 1",
        content: "Cached content",
      },
    ];
    setupDbMock(rows);
    setupCacheHit(rows, "bW9jay1wZGYtZGF0YQ=="); // "mock-pdf-data" encoded
    const res = await GET(
      new Request("http://localhost/api/curriculum/cached-book/export/pdf"),
      makeParams("cached-book"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = await res.arrayBuffer();
    expect(Buffer.from(buf).toString()).toBe("mock-pdf-data");
    expect(renderBookHtml).not.toHaveBeenCalled();
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it("regenerates PDF when cached entry has different hash", async () => {
    const { renderBookHtml } = await import("@/lib/pdf/render-book-html");
    const rows = [
      {
        bookTitle: "Stale Book",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Ch 1",
        content: "Stale content",
      },
    ];
    setupDbMock(rows);
    // Return a cache entry with a non-matching hash (wrong title)
    mockLimit.mockResolvedValue([
      {
        bookSlug: "stale-book",
        contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        pdfData: "b2xkLXBkZi1kYXRh",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/curriculum/stale-book/export/pdf"),
      makeParams("stale-book"),
    );

    expect(res.status).toBe(200);
    expect(renderBookHtml).toHaveBeenCalled();
  });

  it("stores new PDF in cache after generation", async () => {
    const rows = [
      {
        bookTitle: "Cache Store",
        articleId: 1,
        position: 0,
        partTitle: null,
        title: "Ch 1",
        content: "Store me",
      },
    ];
    setupDbMock(rows);
    await GET(
      new Request("http://localhost/api/curriculum/cache-store/export/pdf"),
      makeParams("cache-store"),
    );

    // Should delete old cache and insert new
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
  });
});
