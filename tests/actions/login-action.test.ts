// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

const mockVerifyPassword = vi.hoisted(() => vi.fn());
const mockSetSessionCookie = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  verifyPassword: mockVerifyPassword,
  setSessionCookie: mockSetSessionCookie,
}));

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

import { loginAction } from "@/app/login/actions";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

function setupUser(user: { id: number; email: string; passwordHash: string; isRootAdmin: boolean; userSlug: string } | null) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(user ? [user] : []),
  };
  mockSelect.mockReturnValue(chain);
}

const VALID_USER = {
  id: 1,
  email: "user@example.com",
  passwordHash: "$hashed",
  isRootAdmin: false,
  userSlug: "user-slug",
};

describe("loginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    mockSetSessionCookie.mockResolvedValue(undefined);
    mockVerifyPassword.mockResolvedValue(true);
    setupUser(VALID_USER);
  });

  it("redirects to userSlug on successful login with no redirect param", async () => {
    const fd = makeFormData({ email: "user@example.com", password: "pass" });
    await expect(loginAction(fd)).rejects.toThrow("NEXT_REDIRECT:/user-slug");
  });

  it("redirects to safe redirect param after login", async () => {
    const fd = makeFormData({
      email: "user@example.com",
      password: "pass",
      redirect: "/foo/bar",
    });
    await expect(loginAction(fd)).rejects.toThrow("NEXT_REDIRECT:/foo/bar");
  });

  it("ignores absolute URL redirect param", async () => {
    const fd = makeFormData({
      email: "user@example.com",
      password: "pass",
      redirect: "https://evil.com",
    });
    await expect(loginAction(fd)).rejects.toThrow("NEXT_REDIRECT:/user-slug");
  });

  it("ignores protocol-relative redirect param", async () => {
    const fd = makeFormData({
      email: "user@example.com",
      password: "pass",
      redirect: "//evil.com",
    });
    await expect(loginAction(fd)).rejects.toThrow("NEXT_REDIRECT:/user-slug");
  });

  it("ignores redirect param with CRLF injection", async () => {
    const fd = makeFormData({
      email: "user@example.com",
      password: "pass",
      redirect: "/a\r\nSet-Cookie: bad=1",
    });
    await expect(loginAction(fd)).rejects.toThrow("NEXT_REDIRECT:/user-slug");
  });

  it("returns an error (no navigation) for unknown user", async () => {
    setupUser(null);
    const fd = makeFormData({ email: "unknown@example.com", password: "pass" });
    // Returned, not redirected, so the login form keeps its state.
    await expect(loginAction(fd)).resolves.toEqual({ error: "Invalid email or password." });
  });

  it("returns an error (no navigation) for wrong password", async () => {
    mockVerifyPassword.mockResolvedValue(false);
    const fd = makeFormData({ email: "user@example.com", password: "wrong" });
    await expect(loginAction(fd)).resolves.toEqual({ error: "Invalid email or password." });
  });
});
