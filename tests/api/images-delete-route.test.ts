// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const mockDel = vi.hoisted(() => vi.fn());
const mockRequireSession = vi.hoisted(() => vi.fn());
const mockResolvePublisher = vi.hoisted(() => vi.fn());
const mockCanEditContent = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  list: vi.fn(),
  del: mockDel,
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

function makePublisher(slug = "alice") {
  return { kind: "user", userId: 1, orgId: null, slug, displayName: "Alice" };
}

function makeRequest(segments: string[]): Request {
  return new Request(`http://localhost/api/images/${segments.join("/")}`, { method: "DELETE" });
}

function makeRouteParams(segments: string[]) {
  return { params: Promise.resolve({ path: segments }) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DELETE /api/images/[...path]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });

  it("returns 400 when the path shape is invalid", async () => {
    mockRequireSession.mockResolvedValue(makeSession());

    const { DELETE } = await import("@/app/api/images/[...path]/route");
    const res = await DELETE(
      makeRequest(["foo", "bar"]),
      makeRouteParams(["foo", "bar"])
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user does not own the blob", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    // The blob belongs to "bob"
    mockResolvePublisher.mockResolvedValue(makePublisher("bob"));
    mockCanEditContent.mockResolvedValue(false);

    const { DELETE } = await import("@/app/api/images/[...path]/route");
    const segments = ["images", "bob", "abc123.png"];
    const res = await DELETE(makeRequest(segments), makeRouteParams(segments));
    expect(res.status).toBe(403);
  });

  it("returns 204 and calls del on the happy path", async () => {
    mockRequireSession.mockResolvedValue(makeSession());
    mockResolvePublisher.mockResolvedValue(makePublisher("alice"));
    mockCanEditContent.mockResolvedValue(true);
    mockDel.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/images/[...path]/route");
    const segments = ["images", "alice", "abc123.png"];
    const res = await DELETE(makeRequest(segments), makeRouteParams(segments));
    expect(res.status).toBe(204);
    expect(mockDel).toHaveBeenCalledOnce();
    expect(mockDel).toHaveBeenCalledWith("images/alice/abc123.png");
  });
});
