import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopySnippet from "@/components/CopySnippet";

/**
 * Installs a clipboard stub; `fail: true` simulates a denied/insecure context.
 * Must be called *after* `userEvent.setup()`, which installs its own stub.
 */
function stubClipboard(opts: { fail?: boolean } = {}) {
  const writeText = vi.fn(() =>
    opts.fail ? Promise.reject(new Error("denied")) : Promise.resolve()
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

describe("CopySnippet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("copies the exact value", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const writeText = stubClipboard();
    render(<CopySnippet value="[[alice:articles:intro]]" label="Copy wikilink" />);

    await user.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("[[alice:articles:intro]]");
  });

  it("confirms, then reverts to the original label", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubClipboard();
    render(<CopySnippet value="x" label="Copy wikilink" />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Copied");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button")).toHaveTextContent("Copy wikilink");
  });

  it("announces the copy to screen readers", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubClipboard();
    const { container } = render(<CopySnippet value="[[a:objects:anim-x]]" label="Copy" />);

    await user.click(screen.getByRole("button"));
    const live = container.querySelector("[aria-live='polite']");
    expect(live).toHaveTextContent("[[a:objects:anim-x]]");
  });

  it("says so when the clipboard is unavailable rather than faking success", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubClipboard({ fail: true });
    render(<CopySnippet value="x" label="Copy wikilink" />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).not.toHaveTextContent("Copied");
    expect(screen.getByRole("button")).toHaveTextContent("⌘C");
  });

  it("exposes the snippet via title, so it is recoverable without a copy", () => {
    stubClipboard();
    render(<CopySnippet value="[[a:articles:b]]" label="Copy" />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "[[a:articles:b]]");
  });

  it("uses a custom copied label when given", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubClipboard();
    render(<CopySnippet value="x" label="Copy embed tag" copiedLabel="Tag copied" />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Tag copied");
  });
});
