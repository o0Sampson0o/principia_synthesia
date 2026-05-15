// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock @/db ---
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    and: vi.fn((...conds) => ({ _type: "and", conds })),
  };
});

import { GET } from "@/app/api/animations/[slug]/route";
import { defaultLight } from "@/lib/theme";

// Helper: build a fake Next.js Request
function makeRequest(slug: string, themeParam?: string): Request {
  const base = `http://localhost/api/animations/${slug}`;
  const url = themeParam ? `${base}?theme=${themeParam}` : base;
  return new Request(url);
}

// Helper: build the params promise for the route handler
function makeParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

// Set up the Drizzle chain mock before each test
function setupDbMock(rows: any[]) {
  mockLimit.mockResolvedValue(rows);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("GET /api/animations/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when animation is not found", async () => {
    setupDbMock([]);
    const req = makeRequest("nonexistent");
    const res = await GET(req, makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 404 body text when not found", async () => {
    setupDbMock([]);
    const req = makeRequest("nonexistent");
    const res = await GET(req, makeParams("nonexistent"));
    const text = await res.text();
    expect(text).toContain("Not found");
  });

  it("returns Content-Type: text/html for a found animation", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function MyAnim() {}" } }]);
    const req = makeRequest("my-anim");
    const res = await GET(req, makeParams("my-anim"));
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("returned HTML contains window.theme injected as a script", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function MyAnim() {}" } }]);
    const req = makeRequest("my-anim");
    const res = await GET(req, makeParams("my-anim"));
    const html = await res.text();
    expect(html).toContain("window.theme");
  });

  it("calls the animation function if code has 'function FnName'", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function MyAnim() {}" } }]);
    const req = makeRequest("my-anim");
    const res = await GET(req, makeParams("my-anim"));
    const html = await res.text();
    expect(html).toContain("MyAnim();");
  });

  it("does not append a function call when code has no function declaration", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "const x = 1;" } }]);
    const req = makeRequest("my-anim");
    const res = await GET(req, makeParams("my-anim"));
    const html = await res.text();
    expect(html).not.toMatch(/\w+\(\);/);
  });

  it("a ?theme= query param overrides the default light tokens", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function A() {}" } }]);
    const customLight = { ...defaultLight, background: "#ff1122" };
    const themeParam = encodeURIComponent(JSON.stringify({ light: customLight, dark: {} }));
    const req = makeRequest("my-anim", themeParam);
    const res = await GET(req, makeParams("my-anim"));
    const html = await res.text();
    expect(html).toContain("#ff1122");
  });

  it("falls back gracefully to defaults when ?theme= contains invalid JSON", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function A() {}" } }]);
    const req = makeRequest("my-anim", "NOT_VALID_JSON");
    const res = await GET(req, makeParams("my-anim"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(defaultLight.background);
  });

  it("falls back gracefully to defaults when ?theme= is malformed percent-encoding", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function A() {}" } }]);
    const req = makeRequest("my-anim", "%7Bnot-json%7D");
    const res = await GET(req, makeParams("my-anim"));
    expect(res.status).toBe(200);
  });

  it("extracts the first function name from code with multiple functions", async () => {
    const code = "function FirstFn() {} function SecondFn() {}";
    setupDbMock([{ id: 1, slug: "multi", name: "Multi", type: "animation", content: { code } }]);
    const req = makeRequest("multi");
    const res = await GET(req, makeParams("multi"));
    const html = await res.text();
    expect(html).toContain("FirstFn();");
    expect(html).not.toContain("SecondFn();");
  });

  it("returned HTML is a valid HTML document (has DOCTYPE and body)", async () => {
    setupDbMock([{ id: 1, slug: "my-anim", name: "My Animation", type: "animation", content: { code: "function A() {}" } }]);
    const req = makeRequest("my-anim");
    const res = await GET(req, makeParams("my-anim"));
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
  });

  it("the animation code itself appears in the returned HTML", async () => {
    const code = "function MySpecialAnim() { /* draw here */ }";
    setupDbMock([{ id: 1, slug: "special", name: "Special", type: "animation", content: { code } }]);
    const req = makeRequest("special");
    const res = await GET(req, makeParams("special"));
    const html = await res.text();
    expect(html).toContain(code);
  });
});
