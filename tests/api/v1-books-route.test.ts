// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: { get select() { return mockSelect; } } }));

const mockGetApiSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  const { NextResponse } = await import("next/server");
  return {
    ...actual,
    getApiSession: mockGetApiSession,
    requireApiSession: async (req: Request) => {
      const session = await mockGetApiSession(req);
      return session ?? NextResponse.json({ error: "unauthorized" }, { status: 401 });
    },
  };
});

const mockResolvePublisher = vi.hoisted(() => vi.fn());
vi.mock("@/lib/publisher", () => ({ resolvePublisher: mockResolvePublisher }));

const mockCanEditContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/roles", () => ({ canEditContent: mockCanEditContent }));

const mockUpdateBookStructureCore = vi.hoisted(() => vi.fn());
vi.mock("@/lib/books-write", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/books-write")>();
  return { ...actual, updateBookStructureCore: mockUpdateBookStructureCore };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { __resetForTests } from "@/lib/rate-limit";
import {
  BookStructureConflictError,
  BookSectionSetMismatchError,
} from "@/lib/books-write";

const SESSION = { userId: 10, email: "a@b.c", userSlug: "alice", isRootAdmin: false };
const PUBLISHER = { kind: "user", userId: 10, orgId: null, slug: "alice", displayName: "Alice" };

function authOk() {
  mockGetApiSession.mockResolvedValue(SESSION);
  mockResolvePublisher.mockResolvedValue(PUBLISHER);
  mockCanEditContent.mockResolvedValue(true);
}

const BASE = "http://localhost/api/v1/publishers/alice/books/book-x";
const params = { params: Promise.resolve({ publisher: "alice", slug: "book-x" }) };

function req(opts: { body?: unknown; ifMatch?: string; token?: boolean } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.token !== false) headers.Authorization = "Bearer pst_test";
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.ifMatch) headers["If-Match"] = `"${opts.ifMatch}"`;
  return new Request(BASE, {
    method: "PUT",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const SECTIONS = [
  { articleSlug: "article-one", partTitle: "Part I", chapterTitle: "Chapter 1" },
  { articleSlug: "article-two", partTitle: null, chapterTitle: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();
});

describe("PUT /api/v1/publishers/[publisher]/books/[slug]", () => {
  it("401 without a token", async () => {
    mockGetApiSession.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/books/[slug]/route");
    expect((await PUT(req({ token: false }), params)).status).toBe(401);
  });

  it("428 without If-Match", async () => {
    authOk();
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/books/[slug]/route");
    const res = await PUT(req({ body: { sections: SECTIONS } }), params);
    expect(res.status).toBe(428);
    expect(mockUpdateBookStructureCore).not.toHaveBeenCalled();
  });

  it("422 for an invalid body", async () => {
    authOk();
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/books/[slug]/route");
    const res = await PUT(req({ body: { sections: [{ articleSlug: "not-a-slug!" }] }, ifMatch: "h" }), params);
    expect(res.status).toBe(422);
  });

  it("200 and forwards the base hash + sections to the core", async () => {
    authOk();
    mockUpdateBookStructureCore.mockResolvedValue({ structureHash: "new", updatedAt: new Date() });
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/books/[slug]/route");
    const res = await PUT(req({ body: { sections: SECTIONS }, ifMatch: "base" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).structureHash).toBe("new");
    expect(mockUpdateBookStructureCore).toHaveBeenCalledWith(
      expect.objectContaining({ bookSlug: "book-x", expectedStructureHash: "base" })
    );
  });

  it("412 on a structure conflict", async () => {
    authOk();
    mockUpdateBookStructureCore.mockRejectedValue(
      new BookStructureConflictError("remotehash", new Date())
    );
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/books/[slug]/route");
    const res = await PUT(req({ body: { sections: SECTIONS }, ifMatch: "stale" }), params);
    expect(res.status).toBe(412);
    expect((await res.json()).remoteStructureHash).toBe("remotehash");
  });

  it("409 when the section set changed", async () => {
    authOk();
    mockUpdateBookStructureCore.mockRejectedValue(
      new BookSectionSetMismatchError(["article-new"], ["article-gone"])
    );
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/books/[slug]/route");
    const res = await PUT(req({ body: { sections: SECTIONS }, ifMatch: "h" }), params);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("section_set_mismatch");
    expect(json.added).toEqual(["article-new"]);
    expect(json.removed).toEqual(["article-gone"]);
  });
});
