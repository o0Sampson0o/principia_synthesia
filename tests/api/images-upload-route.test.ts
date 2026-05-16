// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const mockPut = vi.hoisted(() => vi.fn());
const mockRequireSession = vi.hoisted(() => vi.fn());
const mockResolvePublisher = vi.hoisted(() => vi.fn());
const mockCanEditContent = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({
  put: mockPut,
  list: vi.fn(),
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

function buildFormData(publisherSlug: string, file: File): FormData {
  const fd = new FormData();
  fd.append("publisher", publisherSlug);
  fd.append("file", file);
  return fd;
}

function makeRequest(fd: FormData): Request {
  return new Request("http://localhost/api/images/upload", { method: "POST", body: fd });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/images/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set token so the route doesn't bail with 503
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });

  it("rejects unauthenticated requests by rethrowing the redirect", async () => {
    mockRequireSession.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/login" });
    });

    const { POST } = await import("@/app/api/images/upload/route");
    const fd = buildFormData("alice", new File([new Uint8Array(10)], "a.png", { type: "image/png" }));
    await expect(POST(makeRequest(fd))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("returns 404 when the publisher does not exist", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(null);

    const { POST } = await import("@/app/api/images/upload/route");
    const fd = buildFormData("alice", new File([new Uint8Array(10)], "a.png", { type: "image/png" }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks edit rights", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(false);

    const { POST } = await import("@/app/api/images/upload/route");
    const fd = buildFormData("alice", new File([new Uint8Array(10)], "a.png", { type: "image/png" }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(403);
  });

  it("returns 413 for an oversized file", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(true);

    const { POST } = await import("@/app/api/images/upload/route");
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    const fd = buildFormData("alice", bigFile);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(413);
  });

  it("returns 415 for a disallowed MIME type", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(true);

    const { POST } = await import("@/app/api/images/upload/route");
    const textFile = new File([new Uint8Array(10)], "doc.txt", { type: "text/plain" });
    const fd = buildFormData("alice", textFile);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(415);
  });

  it("returns 201 with url and pathname for a valid upload", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher());
    mockCanEditContent.mockResolvedValue(true);
    mockPut.mockResolvedValue({
      url: "https://abc.public.blob.vercel-storage.com/images/alice/uuid.png",
      pathname: "images/alice/uuid.png",
    });

    const { POST } = await import("@/app/api/images/upload/route");
    const validFile = new File([new Uint8Array(1024)], "a.png", { type: "image/png" });
    const fd = buildFormData("alice", validFile);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty("url");
    expect(body).toHaveProperty("pathname");
    expect(body.pathname).toMatch(/^images\/alice\//);
  });
});
