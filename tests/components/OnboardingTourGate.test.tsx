// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockSelectLimit = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

// ─── Tour component mock (avoid importing client code in node env) ────────────

vi.mock("@/components/OnboardingTour", () => ({
  default: ({ publisherSlug }: { publisherSlug: string }) => ({
    type: "OnboardingTour",
    props: { publisherSlug },
  }),
}));

import OnboardingTourGate from "@/components/OnboardingTourGate";

function setupDb(row: Record<string, unknown> | null) {
  mockSelect.mockReturnValue({ from: mockSelectFrom });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
  mockSelectLimit.mockResolvedValue(row ? [row] : []);
}

describe("OnboardingTourGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when session is null (guest)", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await OnboardingTourGate();
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns null when emailVerifiedAt is null", async () => {
    mockGetSession.mockResolvedValue({ userId: 1, email: "a@x.com", userSlug: "a", isRootAdmin: false });
    setupDb({ emailVerifiedAt: null, onboardingCompletedAt: null, publisherSlug: "a" });

    const result = await OnboardingTourGate();
    expect(result).toBeNull();
  });

  it("returns null when onboardingCompletedAt is already set", async () => {
    mockGetSession.mockResolvedValue({ userId: 1, email: "a@x.com", userSlug: "a", isRootAdmin: false });
    setupDb({ emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), publisherSlug: "a" });

    const result = await OnboardingTourGate();
    expect(result).toBeNull();
  });

  it("returns OnboardingTour element when user is verified and onboarding is pending", async () => {
    mockGetSession.mockResolvedValue({ userId: 1, email: "a@x.com", userSlug: "a", isRootAdmin: false });
    setupDb({ emailVerifiedAt: new Date(), onboardingCompletedAt: null, publisherSlug: "alice" });

    const result = await OnboardingTourGate();
    expect(result).not.toBeNull();
  });
});
