// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockConsumeVerificationToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  consumeVerificationToken: mockConsumeVerificationToken,
}));

// ─── Seed mock ────────────────────────────────────────────────────────────────

const mockSeedOnboardingArticle = vi.hoisted(() => vi.fn());

vi.mock("@/lib/onboarding-seed", () => ({
  seedOnboardingArticle: mockSeedOnboardingArticle,
}));

// ─── next/navigation mock ─────────────────────────────────────────────────────

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { confirmVerification } from "@/app/verify-email/[token]/actions";

function makeFormData(token: string): FormData {
  const fd = new FormData();
  fd.set("token", token);
  return fd;
}

describe("confirmVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("calls seedOnboardingArticle with userId and redirects to /login?verified=1 on success", async () => {
    mockConsumeVerificationToken.mockResolvedValue(42);
    mockSeedOnboardingArticle.mockResolvedValue(undefined);

    await expect(confirmVerification(makeFormData("valid-token"))).rejects.toThrow(
      "NEXT_REDIRECT:/login?verified=1",
    );

    expect(mockConsumeVerificationToken).toHaveBeenCalledWith("valid-token");
    expect(mockSeedOnboardingArticle).toHaveBeenCalledWith(42);
    expect(mockRedirect).toHaveBeenCalledWith("/login?verified=1");
  });

  it("redirects to /login?verified=error and does NOT call seed when token is invalid", async () => {
    mockConsumeVerificationToken.mockResolvedValue(null);

    await expect(confirmVerification(makeFormData("bad-token"))).rejects.toThrow(
      "NEXT_REDIRECT:/login?verified=error",
    );

    expect(mockSeedOnboardingArticle).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/login?verified=error");
  });

  it("redirects to /login?verified=error when token field is missing", async () => {
    const fd = new FormData();

    await expect(confirmVerification(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/login?verified=error",
    );

    expect(mockConsumeVerificationToken).not.toHaveBeenCalled();
    expect(mockSeedOnboardingArticle).not.toHaveBeenCalled();
  });

  it("swallows seed errors and still redirects to /login?verified=1", async () => {
    mockConsumeVerificationToken.mockResolvedValue(7);
    mockSeedOnboardingArticle.mockRejectedValue(new Error("DB exploded"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(confirmVerification(makeFormData("valid-token"))).rejects.toThrow(
      "NEXT_REDIRECT:/login?verified=1",
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "[onboarding] seed failed for user",
      7,
      expect.any(Error),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/login?verified=1");

    consoleSpy.mockRestore();
  });
});
