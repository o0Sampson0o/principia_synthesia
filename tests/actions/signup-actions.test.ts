// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockSelectLimit = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

const mockInsert = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const mockTx = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockSetSessionCookie = vi.hoisted(() => vi.fn());
const mockCreateVerificationToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  setSessionCookie: mockSetSessionCookie,
  createVerificationToken: mockCreateVerificationToken,
}));

// ─── Email mock ───────────────────────────────────────────────────────────────

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
  buildVerificationEmailHtml: vi.fn().mockReturnValue("<html>verify</html>"),
}));

// ─── next/navigation mock ─────────────────────────────────────────────────────

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

// ─── next/headers mock ────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue("localhost:3000"),
  }),
}));

import { signupAction } from "@/app/signup/actions";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

const validForm = {
  email: "newuser@example.com",
  password: "password123",
  displayName: "New User",
  publisherSlug: "new-user",
};

describe("signupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([]);

    const txInsertValues = vi.fn();
    const txInsertReturning = vi.fn();
    txInsertValues.mockReturnValue({ returning: txInsertReturning });
    txInsertReturning.mockResolvedValueOnce([{ id: 99, email: "newuser@example.com" }]);
    txInsertReturning.mockResolvedValue([]);
    mockTx.insert.mockReturnValue({ values: txInsertValues });

    mockCreateVerificationToken.mockResolvedValue("raw-token-abc");
    mockSetSessionCookie.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("redirects to /signup/check-email after successful signup", async () => {
    await signupAction(makeFormData(validForm));
    expect(mockRedirect).toHaveBeenCalledWith("/signup/check-email");
  });

  it("calls createVerificationToken with the new user id", async () => {
    await signupAction(makeFormData(validForm));
    expect(mockCreateVerificationToken).toHaveBeenCalledWith(99);
  });

  it("calls sendEmail with the verification URL containing the raw token", async () => {
    await signupAction(makeFormData(validForm));
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "newuser@example.com",
        subject: expect.stringContaining("Verify"),
      })
    );
  });

  it("calls setSessionCookie with the new user's session data", async () => {
    await signupAction(makeFormData(validForm));
    expect(mockSetSessionCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        email: "newuser@example.com",
        userSlug: "new-user",
        isRootAdmin: false,
      })
    );
  });

  it("redirects to /signup?error=email_taken when email is already taken", async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: 1 }]);
    mockRedirect.mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });
    await expect(signupAction(makeFormData(validForm))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/signup?error=email_taken");
    expect(mockCreateVerificationToken).not.toHaveBeenCalled();
  });

  it("redirects to /signup?error=slug_taken when slug is already taken", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    mockSelectLimit.mockResolvedValueOnce([{ id: 5 }]);
    mockRedirect.mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });
    await expect(signupAction(makeFormData(validForm))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/signup?error=slug_taken");
    expect(mockCreateVerificationToken).not.toHaveBeenCalled();
  });
});
