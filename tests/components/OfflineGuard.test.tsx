import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import OfflineGuard from "@/components/OfflineGuard";

describe("OfflineGuard", () => {
  let onLineSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    onLineSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it("renders nothing when navigator.onLine is true", () => {
    onLineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { container } = render(<OfflineGuard />);
    act(() => {});
    expect(container.firstChild).toBeNull();
  });

  it("renders the offline banner when navigator.onLine is false on mount", () => {
    onLineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineGuard />);
    act(() => {});
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/You are offline/i)).toBeInTheDocument();
  });

  it("shows the banner after the offline event fires", () => {
    onLineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineGuard />);
    act(() => {});
    // Banner should not be visible yet
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => {
      fireEvent(window, new Event("offline"));
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/You are offline/i)).toBeInTheDocument();
  });

  it("hides the banner after the online event fires following an offline event", () => {
    onLineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineGuard />);
    act(() => {});

    // Go offline
    act(() => {
      fireEvent(window, new Event("offline"));
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Come back online
    act(() => {
      fireEvent(window, new Event("online"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
