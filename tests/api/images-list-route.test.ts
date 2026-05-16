// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const mockList = vi.hoisted(() => vi.fn());
const mockRequireSession = vi.hoisted(() => vi.fn());
const mockResolvePublisher = vi.hoisted(() => vi.fn());
const mockCanEditContent = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  list: mockList,
  del: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSession: mockRequireSession,
  getSession: vi.fn(),
}));

vi.mock("@/lib/publisher", () => ({
  resolvePublisher: mockResolvePublisher,
}));

vi.mock("@/lib/roles", () => ({
  canEditContent: mockCanEditContent,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession() {
  return { userId: 1, email: "alice@example.com", userSlug: "alice", isRootAdmin: false };
}

function makePublisher() {
  return { kind: "user", userId: 1, orgId: null, slug: "alice", displayName: "Alice" };
}

function makeRequest(publisherSlug: string): Request {
  return new Request(`http://localhost/api/images/list?publisher=${publisherSlug}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/images/list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });

  it("rejects unauthenticated requests by rethrowing the redirect", async () => {
    mockRequireSession.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/login" });
    });

    const { GET } = await import("@/app/api/images/list/route");
    await expect(GET(makeRequest("alice"))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("returns 404 when the publisher does not exist", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(null);

    const { GET } = await import("@/app/api/images/list/route");
    const res = await GET(makeRequest("alice"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks edit rights", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(false);

    const { GET } = await import("@/app/api/images/list/route");
    const res = await GET(makeRequest("alice"));
    expect(res.status).toBe(403);
  });

  it("returns sorted images on the happy path", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(true);
    mockList.mockResolvedValue({
      blobs: [
        { url: "https://abc.public.blob.vercel-storage.com/images/alice/a.png", pathname: "images/alice/a.png", size: 1024, uploadedAt: new Date("2026-01-01") },
        { url: "https://abc.public.blob.vercel-storage.com/images/alice/b.png", pathname: "images/alice/b.png", size: 2048, uploadedAt: new Date("2026-01-03") },
      ],
    });

    const { GET } = await import("@/app/api/images/list/route");
    const res = await GET(makeRequest("alice"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.images).toHaveLength(2);
    // Sorted descending by uploadedAt
    expect(body.images[0].pathname).toBe("images/alice/b.png");
    expect(body.images[1].pathname).toBe("images/alice/a.png");
  });

  it("returns an empty array when there are no images", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(true);
    mockList.mockResolvedValue({ blobs: [] });

    const { GET } = await import("@/app/api/images/list/route");
    const res = await GET(makeRequest("alice"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.images).toEqual([]);
  });
});
