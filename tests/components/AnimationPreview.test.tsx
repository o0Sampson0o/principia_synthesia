import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import AnimationPreview from "@/components/AnimationPreview";

vi.mock("@/lib/useAnimationSrc", () => ({
  useAnimationSrc: () => "/api/publishers/alice/animations/anim-x?theme=%7B%7D",
}));

describe("AnimationPreview", () => {
  it('renders an iframe with sandbox="allow-scripts"', () => {
    const { container } = render(
      <AnimationPreview publisher="alice" slug="anim-x" />
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("does NOT grant allow-same-origin", () => {
    const { container } = render(
      <AnimationPreview publisher="alice" slug="anim-x" />
    );
    const sandbox = container.querySelector("iframe")!.getAttribute("sandbox")!;
    expect(sandbox).not.toContain("allow-same-origin");
  });
});
