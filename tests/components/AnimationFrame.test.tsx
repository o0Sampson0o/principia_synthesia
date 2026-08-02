import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import AnimationFrame from "@/components/AnimationFrame";
import {
  ANIMATION_HEIGHT_MESSAGE,
  DEFAULT_ANIMATION_HEIGHT,
  MAX_ANIMATION_HEIGHT,
} from "@/lib/animation-dimensions";

vi.mock("@/lib/useAnimationSrc", () => ({
  useAnimationSrc: () => "/api/publishers/alice/animations/anim-x?theme=%7B%7D",
}));

/** Dispatches a height message as if it came from `source`. */
function postHeight(source: unknown, height: unknown, type = ANIMATION_HEIGHT_MESSAGE) {
  const event = new MessageEvent("message", { data: { type, height } });
  Object.defineProperty(event, "source", { value: source });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe("AnimationFrame", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders at the default height before the frame reports one", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    const frame = screen.getByTitle("Animation: anim-x");
    expect(frame).toHaveStyle({ height: `${DEFAULT_ANIMATION_HEIGHT}px` });
  });

  it("applies a height reported by its own frame", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    const frame = screen.getByTitle("Animation: anim-x") as HTMLIFrameElement;
    postHeight(frame.contentWindow, 720);
    expect(frame).toHaveStyle({ height: "720px" });
  });

  it("ignores messages from any other window", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    const frame = screen.getByTitle("Animation: anim-x");
    postHeight(window, 720);
    expect(frame).toHaveStyle({ height: `${DEFAULT_ANIMATION_HEIGHT}px` });
  });

  it("ignores messages with a different type tag", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    const frame = screen.getByTitle("Animation: anim-x") as HTMLIFrameElement;
    postHeight(frame.contentWindow, 720, "something-else");
    expect(frame).toHaveStyle({ height: `${DEFAULT_ANIMATION_HEIGHT}px` });
  });

  it("clamps an out-of-range reported height", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    const frame = screen.getByTitle("Animation: anim-x") as HTMLIFrameElement;
    postHeight(frame.contentWindow, 99999);
    expect(frame).toHaveStyle({ height: `${MAX_ANIMATION_HEIGHT}px` });
  });

  it("falls back to the default when the reported height is junk", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    const frame = screen.getByTitle("Animation: anim-x") as HTMLIFrameElement;
    postHeight(frame.contentWindow, "very tall");
    expect(frame).toHaveStyle({ height: `${DEFAULT_ANIMATION_HEIGHT}px` });
  });

  it("caps the reported height at maxHeight for cramped panels", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" maxHeight={300} />);
    const frame = screen.getByTitle("Animation: anim-x") as HTMLIFrameElement;
    postHeight(frame.contentWindow, 900);
    expect(frame).toHaveStyle({ height: "300px" });
  });

  it("does not pad a short animation up to maxHeight", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" maxHeight={300} />);
    const frame = screen.getByTitle("Animation: anim-x") as HTMLIFrameElement;
    postHeight(frame.contentWindow, 180);
    expect(frame).toHaveStyle({ height: "180px" });
  });

  it("keeps the sandbox attribute so animation code stays isolated", () => {
    render(<AnimationFrame publisher="alice" slug="anim-x" />);
    expect(screen.getByTitle("Animation: anim-x")).toHaveAttribute("sandbox", "allow-scripts");
  });
});
