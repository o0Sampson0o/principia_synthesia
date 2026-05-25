// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// ─── next/navigation mock ─────────────────────────────────────────────────────

const mockRouterPush = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname.value,
}));

// ─── Server action mock ────────────────────────────────────────────────────────

const mockCompleteOnboarding = vi.hoisted(() => vi.fn());

vi.mock("@/app/settings/onboarding/actions", () => ({
  completeOnboarding: mockCompleteOnboarding,
}));

import OnboardingTour from "@/components/OnboardingTour";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("OnboardingTour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompleteOnboarding.mockResolvedValue(undefined);
    mockPathname.value = "/";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing on viewports narrower than 768px", async () => {
    mockMatchMedia(false);
    const { container } = render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});
    expect(container.firstChild).toBeNull();
  });

  it("renders the tour dialog on desktop viewports", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
  });

  it("applies tour-highlight class to the target element when present", async () => {
    mockMatchMedia(true);
    const target = document.createElement("a");
    target.setAttribute("data-tour", "new-article-button");
    target.textContent = "New article";
    document.body.appendChild(target);

    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    expect(target.classList.contains("tour-highlight")).toBe(true);
  });

  it("shows fallback overlay when target element is missing", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    const overlay = document.querySelector(".fixed.inset-0");
    expect(overlay).not.toBeNull();
  });

  it("shows fallback navigation link when target is missing", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    expect(screen.getByText(/Go to my publisher/)).toBeInTheDocument();
  });

  it("clicking fallback link calls router.push with publisher href", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    fireEvent.click(screen.getByText(/Go to my publisher/));
    expect(mockRouterPush).toHaveBeenCalledWith("/alice");
  });

  it("clicking Skip tour calls completeOnboarding with outcome=skipped", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    fireEvent.click(screen.getByText("Skip tour"));
    await act(async () => {});

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    const fd: FormData = mockCompleteOnboarding.mock.calls[0][0];
    expect(fd.get("outcome")).toBe("skipped");
  });

  it("clicking Next advances to step 2", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    await act(async () => {});

    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
  });

  it("clicking Back on step 2 returns to step 1", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    fireEvent.click(screen.getByText("Next"));
    await act(async () => {});
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));
    await act(async () => {});
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
  });

  it("clicking Done on the last step calls completeOnboarding with outcome=completed", async () => {
    mockMatchMedia(true);
    render(<OnboardingTour publisherSlug="alice" />);
    await act(async () => {});

    // Advance through all 4 steps
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText("Next"));
      await act(async () => {});
    }

    expect(screen.getByText("Done")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Done"));
    await act(async () => {});

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    const fd: FormData = mockCompleteOnboarding.mock.calls[0][0];
    expect(fd.get("outcome")).toBe("completed");
  });
});
