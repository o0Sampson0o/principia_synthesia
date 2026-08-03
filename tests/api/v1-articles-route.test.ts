// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: {
    get select() { return mockSelect; },
  },
}));

const mockGetApiSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  const { NextResponse } = await import("next/server");
  return {
    ...actual,
    getApiSession: mockGetApiSession,
    // The real requireApiSession closes over the real getApiSession, so it
    // must be replaced too for the mock to take effect.
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

const mockCreateCore = vi.hoisted(() => vi.fn());
const mockUpdateCore = vi.hoisted(() => vi.fn());
const mockDeleteCore = vi.hoisted(() => vi.fn());
vi.mock("@/lib/articles-write", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/articles-write")>();
  return {
    ...actual,
    createArticleCore: mockCreateCore,
    updateArticleCore: mockUpdateCore,
    deleteArticleCore: mockDeleteCore,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { __resetForTests } from "@/lib/rate-limit";
import {
  ArticleConflictError,
  computeContentHash,
} from "@/lib/articles-write";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SESSION = { userId: 10, email: "a@b.c", userSlug: "alice", isRootAdmin: false };
const PUBLISHER = { kind: "user", userId: 10, orgId: null, slug: "alice", displayName: "Alice" };

const ARTICLE_ROW = {
  id: 5,
  slug: "article-x",
  title: "Title",
  summary: null,
  content: "the content",
  ownerType: "user",
  ownerId: 10,
  metadata: { status: "published", tags: [], description: "", canvas: null },
  isInternal: false,
  parentBookId: null,
  updatedAt: new Date("2026-07-01"),
  deletedAt: null,
};

function setupArticleSelect(rows: object[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  // Three call shapes reach this stub:
  //   list route:   .where(...).orderBy(...)
  //   book lookup:  .where(...).limit(1)
  //   article find: .where(...)            ← awaited directly, since it must see
  //                                          every row to detect an ambiguous slug
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    orderBy: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: object[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  });
  // The list route joins books to carry `parentBookSlug`, so `.from()` must
  // offer `.leftJoin()` as well as `.where()`.
  const fromResult: Record<string, unknown> = { where: whereFn };
  fromResult.leftJoin = vi.fn().mockReturnValue(fromResult);
  const fromFn = vi.fn().mockReturnValue(fromResult);
  mockSelect.mockReturnValue({ from: fromFn });
}

function authOk() {
  mockGetApiSession.mockResolvedValue(SESSION);
  mockResolvePublisher.mockResolvedValue(PUBLISHER);
  mockCanEditContent.mockResolvedValue(true);
}

const BASE = "http://localhost/api/v1/publishers/alice/articles";

function req(
  method: string,
  opts: { slug?: string; body?: unknown; ifMatch?: string; token?: boolean } = {}
): Request {
  const headers: Record<string, string> = {};
  if (opts.token !== false) headers.Authorization = "Bearer pst_test";
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.ifMatch) headers["If-Match"] = `"${opts.ifMatch}"`;
  return new Request(opts.slug ? `${BASE}/${opts.slug}` : BASE, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const listParams = { params: Promise.resolve({ publisher: "alice" }) };
const slugParams = { params: Promise.resolve({ publisher: "alice", slug: "article-x" }) };

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();
});

// ─── Guard chain ─────────────────────────────────────────────────────────────

describe("/api/v1 guard chain", () => {
  it("401 without a valid token", async () => {
    mockGetApiSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await GET(req("GET", { token: false }), listParams);
    expect(res.status).toBe(401);
  });

  it("404 for an unknown publisher", async () => {
    mockGetApiSession.mockResolvedValue(SESSION);
    mockResolvePublisher.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await GET(req("GET"), listParams);
    expect(res.status).toBe(404);
  });

  it("403 without edit rights (even for GET)", async () => {
    mockGetApiSession.mockResolvedValue(SESSION);
    mockResolvePublisher.mockResolvedValue(PUBLISHER);
    mockCanEditContent.mockResolvedValue(false);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await GET(req("GET"), listParams);
    expect(res.status).toBe(403);
  });
});

// ─── List + create ───────────────────────────────────────────────────────────

describe("GET /articles (list)", () => {
  it("returns summaries with contentHash and no content field", async () => {
    authOk();
    setupArticleSelect([ARTICLE_ROW]);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await GET(req("GET"), listParams);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.articles).toHaveLength(1);
    expect(json.articles[0].contentHash).toBe(computeContentHash("the content"));
    expect(json.articles[0].content).toBeUndefined();
    expect(json.articles[0].status).toBe("published");
  });

  it("422 for an invalid ?since= value", async () => {
    authOk();
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await GET(new Request(`${BASE}?since=banana`, { headers: { Authorization: "Bearer pst_t" } }), listParams);
    expect(res.status).toBe(422);
  });
});

describe("POST /articles (create)", () => {
  it("201 with the core result", async () => {
    authOk();
    mockCreateCore.mockResolvedValue({
      id: 9,
      slug: "article-new",
      contentHash: "h",
      updatedAt: new Date(),
    });
    const { POST } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await POST(
      req("POST", { body: { slug: "article-new", title: "T", content: "c" } }),
      listParams
    );
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(9);
    expect(mockCreateCore).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "article-new", ownerType: "user", ownerId: 10 })
    );
  });

  it("422 for an invalid slug", async () => {
    authOk();
    const { POST } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await POST(
      req("POST", { body: { slug: "not-an-article-slug!", title: "T", content: "c" } }),
      listParams
    );
    expect(res.status).toBe(422);
    expect(mockCreateCore).not.toHaveBeenCalled();
  });

  it("409 when the slug already exists", async () => {
    authOk();
    mockCreateCore.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    const { POST } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const res = await POST(
      req("POST", { body: { slug: "article-dup", title: "T", content: "c" } }),
      listParams
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("slug_exists");
  });

  it("400 for a non-JSON body", async () => {
    authOk();
    const { POST } = await import("@/app/api/v1/publishers/[publisher]/articles/route");
    const bad = new Request(BASE, { method: "POST", headers: { Authorization: "Bearer pst_t" }, body: "not json" });
    const res = await POST(bad, listParams);
    expect(res.status).toBe(400);
  });
});

// ─── Single article: GET / PUT / DELETE ──────────────────────────────────────

describe("GET /articles/[slug]", () => {
  it("200 with full content and ETag", async () => {
    authOk();
    setupArticleSelect([ARTICLE_ROW]);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await GET(req("GET", { slug: "article-x" }), slugParams);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBe("the content");
    expect(json.contentHash).toBe(computeContentHash("the content"));
    expect(res.headers.get("ETag")).toBe(`"${json.contentHash}"`);
  });

  it("404 when missing", async () => {
    authOk();
    setupArticleSelect([]);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await GET(req("GET", { slug: "article-x" }), slugParams);
    expect(res.status).toBe(404);
  });
});

describe("PUT /articles/[slug]", () => {
  it("428 without If-Match", async () => {
    authOk();
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await PUT(req("PUT", { slug: "article-x", body: { content: "c" } }), slugParams);
    expect(res.status).toBe(428);
    expect(mockUpdateCore).not.toHaveBeenCalled();
  });

  it("412 on a base-hash conflict", async () => {
    authOk();
    setupArticleSelect([ARTICLE_ROW]);
    mockUpdateCore.mockRejectedValue(new ArticleConflictError("remotehash", new Date("2026-07-02")));
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await PUT(
      req("PUT", { slug: "article-x", body: { content: "c" }, ifMatch: "stalehash" }),
      slugParams
    );
    expect(res.status).toBe(412);
    const json = await res.json();
    expect(json.error).toBe("conflict");
    expect(json.remoteContentHash).toBe("remotehash");
  });

  it("200 and passes the unquoted If-Match hash + kept title to the core", async () => {
    authOk();
    setupArticleSelect([ARTICLE_ROW]);
    mockUpdateCore.mockResolvedValue({ contentHash: "newhash", updatedAt: new Date(), current: ARTICLE_ROW });
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await PUT(
      req("PUT", { slug: "article-x", body: { content: "new content" }, ifMatch: "basehash" }),
      slugParams
    );
    expect(res.status).toBe(200);
    expect((await res.json()).contentHash).toBe("newhash");
    expect(mockUpdateCore).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedBaseHash: "basehash", // quotes stripped
        title: "Title", // kept from the stored row when body omits it
        id: 5,
      })
    );
  });

  it("404 when the slug does not exist", async () => {
    authOk();
    setupArticleSelect([]);
    const { PUT } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await PUT(
      req("PUT", { slug: "article-x", body: { content: "c" }, ifMatch: "h" }),
      slugParams
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /articles/[slug]", () => {
  it("428 without If-Match", async () => {
    authOk();
    const { DELETE } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await DELETE(req("DELETE", { slug: "article-x" }), slugParams);
    expect(res.status).toBe(428);
  });

  it("204 on success", async () => {
    authOk();
    setupArticleSelect([ARTICLE_ROW]);
    mockDeleteCore.mockResolvedValue({ found: true });
    const { DELETE } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await DELETE(req("DELETE", { slug: "article-x", ifMatch: "h" }), slugParams);
    expect(res.status).toBe(204);
    expect(mockDeleteCore).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, expectedBaseHash: "h" })
    );
  });

  it("412 when the article changed remotely", async () => {
    authOk();
    setupArticleSelect([ARTICLE_ROW]);
    mockDeleteCore.mockRejectedValue(new ArticleConflictError("rh", null));
    const { DELETE } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await DELETE(req("DELETE", { slug: "article-x", ifMatch: "stale" }), slugParams);
    expect(res.status).toBe(412);
  });
});

// ─── Book-scoped slug resolution ─────────────────────────────────────────────

describe("GET /articles/[slug] — book-internal slug resolution", () => {
  /** Two sections in different books sharing one slug. */
  const IN_BOOK_3 = { ...ARTICLE_ROW, id: 91, isInternal: true, parentBookId: 3 };
  const IN_BOOK_4 = { ...ARTICLE_ROW, id: 92, isInternal: true, parentBookId: 4 };

  it("404 when a bare slug matches sections of two books", async () => {
    authOk();
    setupArticleSelect([IN_BOOK_3, IN_BOOK_4]);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    // Ambiguous: refusing beats silently syncing whichever row came back first.
    const res = await GET(req("GET", { slug: "article-x" }), slugParams);
    expect(res.status).toBe(404);
  });

  it("resolves a lone internal article without a book qualifier", async () => {
    authOk();
    setupArticleSelect([IN_BOOK_3]);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await GET(req("GET", { slug: "article-x" }), slugParams);
    expect(res.status).toBe(200);
  });

  it("prefers the standalone article when a section shares its slug", async () => {
    authOk();
    setupArticleSelect([IN_BOOK_3, ARTICLE_ROW]);
    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await GET(req("GET", { slug: "article-x" }), slugParams);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.parentBookId).toBeNull();
  });

  it("?book= resolves the ambiguity", async () => {
    authOk();
    // The book lookup and the article query share this stub, so the book row
    // must satisfy `.limit(1)` while the article query is awaited directly.
    const limitFn = vi.fn().mockResolvedValue([{ id: 4 }]);
    const rows = [IN_BOOK_3, IN_BOOK_4];
    const whereFn = vi.fn().mockReturnValue({
      limit: limitFn,
      then: (resolve: (v: object[]) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    });
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereFn }) });

    const { GET } = await import("@/app/api/v1/publishers/[publisher]/articles/[slug]/route");
    const res = await GET(
      new Request(`${BASE}/article-x?book=mechanics`, {
        headers: { Authorization: "Bearer pst_test" },
      }),
      slugParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.parentBookId).toBe(4);
  });
});
