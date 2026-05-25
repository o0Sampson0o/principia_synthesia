// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockUpdate = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: mockUpdate,
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockRequireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireSession: mockRequireSession,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

import { completeOnboarding, resetOnboarding } from "@/app/settings/onboarding/actions";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("completeOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 5, email: "u@x.com", userSlug: "u", isRootAdmin: false });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("updates onboardingCompletedAt for the session user with outcome=completed", async () => {
    await completeOnboarding(makeFormData({ outcome: "completed" }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingCompletedAt: expect.any(Date) }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("updates onboardingCompletedAt for the session user with outcome=skipped", async () => {
    await completeOnboarding(makeFormData({ outcome: "skipped" }));

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingCompletedAt: expect.any(Date) }),
    );
  });

  it("throws ZodError before touching DB when outcome is invalid", async () => {
    const { ZodError } = await import("zod");
    await expect(
      completeOnboarding(makeFormData({ outcome: "invalid" })),
    ).rejects.toThrow(ZodError);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("resetOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 5, email: "u@x.com", userSlug: "u", isRootAdmin: false });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("sets onboardingCompletedAt to null for the session user", async () => {
    await resetOnboarding();

    expect(mockUpdateSet).toHaveBeenCalledWith({ onboardingCompletedAt: null });
  });

  it("calls revalidatePath for layout and settings page", async () => {
    await resetOnboarding();

    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/onboarding");
  });
});
