import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/search", () => ({ searchAll: vi.fn(async () => ({ articles: [], books: [], objects: [] })) }));

import CommandPalette from "@/components/CommandPalette";

const isOpen = () => screen.queryByRole("textbox") !== null;

describe("CommandPalette shortcuts", () => {
  it("opens with Ctrl+K and closes with Escape", () => {
    render(<CommandPalette />);
    expect(isOpen()).toBe(false);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(isOpen()).toBe(false);
  });

  it("opens with Cmd+K and still accepts Ctrl+Shift+P", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    expect(isOpen()).toBe(true);
  });

  it("ignores Ctrl+Shift+K and plain k", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "K", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "k" });
    expect(isOpen()).toBe(false);
  });

  it("opens from the nav's ps:open-palette event", () => {
    render(<CommandPalette />);
    act(() => {
      window.dispatchEvent(new Event("ps:open-palette"));
    });
    expect(isOpen()).toBe(true);
  });
});
