// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

const mockPathname = vi.hoisted(() => ({ value: "/start" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.value,
}));

import { useNavMenu } from "@/components/useNavMenu";

describe("useNavMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.value = "/start";
  });

  it("returns open === false initially", () => {
    const { result } = renderHook(() => useNavMenu());
    expect(result.current.open).toBe(false);
  });

  it("setOpen(true) flips state to true", () => {
    const { result } = renderHook(() => useNavMenu());
    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);
  });

  it("Escape key while open flips state to false", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);

    const { result } = renderHook(() => useNavMenu());

    act(() => {
      (result.current.navPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = panel;
      result.current.setOpen(true);
    });

    expect(result.current.open).toBe(true);

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(result.current.open).toBe(false);
    document.body.removeChild(panel);
  });

  it("Tab from last focusable wraps to first", () => {
    const panel = document.createElement("div");
    const a1 = document.createElement("a");
    a1.href = "#";
    const btn = document.createElement("button");
    const a2 = document.createElement("a");
    a2.href = "#";
    panel.appendChild(a1);
    panel.appendChild(btn);
    panel.appendChild(a2);
    document.body.appendChild(panel);

    const { result } = renderHook(() => useNavMenu());

    act(() => {
      (result.current.navPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = panel;
      result.current.setOpen(true);
    });

    a2.focus();
    expect(document.activeElement).toBe(a2);

    act(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    });

    expect(document.activeElement).toBe(a1);
    document.body.removeChild(panel);
  });

  it("Shift+Tab from first focusable wraps to last", () => {
    const panel = document.createElement("div");
    const a1 = document.createElement("a");
    a1.href = "#";
    const btn = document.createElement("button");
    const a2 = document.createElement("a");
    a2.href = "#";
    panel.appendChild(a1);
    panel.appendChild(btn);
    panel.appendChild(a2);
    document.body.appendChild(panel);

    const { result } = renderHook(() => useNavMenu());

    act(() => {
      (result.current.navPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = panel;
      result.current.setOpen(true);
    });

    a1.focus();
    expect(document.activeElement).toBe(a1);

    act(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    });

    expect(document.activeElement).toBe(a2);
    document.body.removeChild(panel);
  });

  it("panel with zero focusables does not error on Tab", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);

    const { result } = renderHook(() => useNavMenu());

    act(() => {
      (result.current.navPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = panel;
      result.current.setOpen(true);
    });

    expect(() => {
      act(() => {
        fireEvent.keyDown(document, { key: "Tab" });
      });
    }).not.toThrow();

    document.body.removeChild(panel);
  });

  it("removes the keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const panel = document.createElement("div");
    document.body.appendChild(panel);

    const { result, unmount } = renderHook(() => useNavMenu());

    act(() => {
      (result.current.navPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = panel;
      result.current.setOpen(true);
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
    document.body.removeChild(panel);
  });
});
