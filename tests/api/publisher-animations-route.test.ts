// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted DB chain mocks ───────────────────────────────────────────────────

const mockPublisherSelectWhereLimit = vi.hoisted(() => vi.fn());
const mockPublisherSelectWhere = vi.hoisted(() => vi.fn());
const mockPublisherSelectFrom = vi.hoisted(() => vi.fn());

const mockObjectSelectWhereLimit = vi.hoisted(() => vi.fn());
const mockObjectSelectWhere = vi.hoisted(() => vi.fn());
const mockObjectSelectFrom = vi.hoisted(() => vi.fn());

const mockSelect = vi.hoisted(() => vi.fn());

// We use a call counter so the second .from() call (objects) returns the
// objects chain and the first (publishers) returns the publisher chain.
let selectCallCount = 0;

vi.mock("@/db", () => ({
  db: {
    get select() {
      return mockSelect;
    },
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

// ─── Access mock ──────────────────────────────────────────────────────────────

const mockCanView = vi.hoisted(() => vi.fn());

vi.mock("@/lib/access", () => ({
  canView: mockCanView,
}));

// ─── Theme mock ───────────────────────────────────────────────────────────────

vi.mock("@/lib/theme", () => ({
  defaultLight: { background: "#fff", foreground: "#000", muted: "#ccc", mutedForeground: "#666", border: "#eee", link: "#00f", linkHover: "#00a", codeBackground: "#f0f0f0", surface: "#fafafa", surfaceHover: "#f0f0f0", primaryBtn: "#00f", primaryBtnText: "#fff", inputBorder: "#ccc", inputFocusBorder: "#00f", secondaryText: "#666" },
  defaultDark:  { background: "#000", foreground: "#fff", muted: "#333", mutedForeground: "#999", border: "#444", link: "#88f", linkHover: "#aaf", codeBackground: "#111", surface: "#111", surfaceHover: "#222", primaryBtn: "#44f", primaryBtnText: "#fff", inputBorder: "#444", inputFocusBorder: "#88f", secondaryText: "#999" },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(publisher: string, slug: string): Request {
  return new Request(`http://localhost/api/publishers/${publisher}/animations/${slug}`);
}

const ANIMATION_ROW = {
  id: 1,
  slug: "anim-test",
  name: "Test animation",
  type: "animation",
  ownerType: "user",
  ownerId: 10,
  content: { code: "function draw() {}" },
  description: null,
  source: null,
  pluginMeta: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PUBLISHER_ROW = {
  kind: "user",
  userId: 10,
  orgId: null,
};

function setupTwoSelects(pubRow: object | null, animRow: object | null) {
  // First select call → publishers chain
  // Second select call → objects chain
  selectCallCount = 0;
  mockSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      // publishers chain
      mockPublisherSelectWhereLimit.mockResolvedValue(pubRow ? [pubRow] : []);
      mockPublisherSelectWhere.mockReturnValue({ limit: mockPublisherSelectWhereLimit });
      mockPublisherSelectFrom.mockReturnValue({ where: mockPublisherSelectWhere });
      return { from: mockPublisherSelectFrom };
    } else {
      // objects chain
      mockObjectSelectWhereLimit.mockResolvedValue(animRow ? [animRow] : []);
      mockObjectSelectWhere.mockReturnValue({ limit: mockObjectSelectWhereLimit });
      mockObjectSelectFrom.mockReturnValue({ where: mockObjectSelectWhere });
      return { from: mockObjectSelectFrom };
    }
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/publishers/[publisher]/animations/[slug]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    selectCallCount = 0;
  });

  it("returns 404 when the publisher does not exist", async () => {
    setupTwoSelects(null, null);
    mockGetSession.mockResolvedValue(null);
    mockCanView.mockResolvedValue(false);

    const { GET } = await import("@/app/api/publishers/[publisher]/animations/[slug]/route");
    const res = await GET(
      makeRequest("unknown-pub", "anim-test"),
      { params: Promise.resolve({ publisher: "unknown-pub", slug: "anim-test" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the animation does not exist", async () => {
    setupTwoSelects(PUBLISHER_ROW, null);
    mockGetSession.mockResolvedValue(null);
    mockCanView.mockResolvedValue(false);

    const { GET } = await import("@/app/api/publishers/[publisher]/animations/[slug]/route");
    const res = await GET(
      makeRequest("alice", "anim-missing"),
      { params: Promise.resolve({ publisher: "alice", slug: "anim-missing" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unauthenticated request to a private animation", async () => {
    setupTwoSelects(PUBLISHER_ROW, ANIMATION_ROW);
    mockGetSession.mockResolvedValue(null);
    mockCanView.mockResolvedValue(false);

    const { GET } = await import("@/app/api/publishers/[publisher]/animations/[slug]/route");
    const res = await GET(
      makeRequest("alice", "anim-test"),
      { params: Promise.resolve({ publisher: "alice", slug: "anim-test" }) }
    );
    expect(res.status).toBe(404);
    expect(mockCanView).toHaveBeenCalledWith(
      expect.objectContaining({ type: "object", slug: "anim-test" }),
      null
    );
  });

  it("returns 404 for a non-admin session without a grant", async () => {
    setupTwoSelects(PUBLISHER_ROW, ANIMATION_ROW);
    const session = { userId: 99, email: "bob@example.com", userSlug: "bob", isRootAdmin: false };
    mockGetSession.mockResolvedValue(session);
    mockCanView.mockResolvedValue(false);

    const { GET } = await import("@/app/api/publishers/[publisher]/animations/[slug]/route");
    const res = await GET(
      makeRequest("alice", "anim-test"),
      { params: Promise.resolve({ publisher: "alice", slug: "anim-test" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 HTML for a root admin session", async () => {
    setupTwoSelects(PUBLISHER_ROW, ANIMATION_ROW);
    const session = { userId: 1, email: "admin@example.com", userSlug: "admin", isRootAdmin: true };
    mockGetSession.mockResolvedValue(session);
    mockCanView.mockResolvedValue(true);

    const { GET } = await import("@/app/api/publishers/[publisher]/animations/[slug]/route");
    const res = await GET(
      makeRequest("alice", "anim-test"),
      { params: Promise.resolve({ publisher: "alice", slug: "anim-test" }) }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
  });

  it("returns 200 HTML for a user with a grant", async () => {
    setupTwoSelects(PUBLISHER_ROW, ANIMATION_ROW);
    const session = { userId: 55, email: "carol@example.com", userSlug: "carol", isRootAdmin: false };
    mockGetSession.mockResolvedValue(session);
    mockCanView.mockResolvedValue(true);

    const { GET } = await import("@/app/api/publishers/[publisher]/animations/[slug]/route");
    const res = await GET(
      makeRequest("alice", "anim-test"),
      { params: Promise.resolve({ publisher: "alice", slug: "anim-test" }) }
    );
    expect(res.status).toBe(200);
  });
});
