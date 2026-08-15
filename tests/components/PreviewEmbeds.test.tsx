import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, act } from "@testing-library/react";
import { usePreviewEmbeds } from "@/components/PreviewEmbeds";

/**
 * The editor Preview's mount points (`lib/preview-mdx-render.ts` leaves a
 * `[data-ps-embed]` hole for anything that needs a browser) and the components
 * that fill them.
 *
 * The children are stubbed: what is under test is the mounting, not what
 * Mermaid draws. The re-render case is the one that matters — an inline
 * `dangerouslySetInnerHTML={{ __html }}` is a new object every render, which
 * makes React re-set `innerHTML` and silently tear the mounted components back
 * out. It looked fine until the next keystroke.
 */
vi.mock("@/components/MermaidBlock", () => ({
  default: ({ source }: { source: string }) => <div data-testid="mermaid">{source}</div>,
}));
vi.mock("@/components/InlineAnimation", () => ({
  default: ({ code, height }: { code: string; height?: string | number }) => (
    <div data-testid="animation" data-height={String(height)}>
      {code}
    </div>
  ),
}));
vi.mock("@/components/DynamicAnimation", () => ({
  default: ({ slug }: { slug: string }) => <div data-testid="stored">{slug}</div>,
}));

const HTML = [
  '<div data-ps-embed="mermaid" data-ps-source="graph TD;"></div>',
  '<div data-ps-embed="inline-animation" data-ps-code="function A() {}" data-ps-height="240"></div>',
  '<div data-ps-embed="stored-animation" data-ps-publisher="alice" data-ps-slug="anim-x"></div>',
  "<p>prose</p>",
].join("");

/** A stand-in for the editor's preview pane. */
function Harness({ html }: { html: string | null }) {
  const previewProps = usePreviewEmbeds(html);
  const [, force] = useState(0);
  return (
    <>
      <button onClick={() => force((n) => n + 1)}>rerender</button>
      <div {...previewProps} />
    </>
  );
}

describe("usePreviewEmbeds", () => {
  it("mounts the real component into each kind of mount point", async () => {
    render(<Harness html={HTML} />);

    expect(await screen.findByTestId("mermaid")).toHaveTextContent("graph TD;");
    expect(screen.getByTestId("animation")).toHaveTextContent("function A() {}");
    expect(screen.getByTestId("animation").dataset.height).toBe("240");
    expect(screen.getByTestId("stored")).toHaveTextContent("anim-x");
  });

  it("survives a re-render of the surrounding editor", async () => {
    render(<Harness html={HTML} />);
    await screen.findByTestId("mermaid");

    await act(async () => {
      screen.getByRole("button", { name: "rerender" }).click();
    });

    expect(screen.getByTestId("mermaid")).toBeInTheDocument();
    expect(screen.getByTestId("animation")).toBeInTheDocument();
  });

  it("mounts into the new elements when the preview HTML changes", async () => {
    const { rerender } = render(<Harness html={HTML} />);
    await screen.findByTestId("mermaid");

    const next = '<div data-ps-embed="mermaid" data-ps-source="graph LR;"></div>';
    rerender(<Harness html={next} />);

    expect(await screen.findByTestId("mermaid")).toHaveTextContent("graph LR;");
    expect(screen.queryByTestId("animation")).toBeNull();
  });

  it("leaves an unrecognised mount point alone rather than erroring", async () => {
    render(<Harness html={'<div data-ps-embed="who-knows"></div>'} />);
    expect(screen.queryByTestId("mermaid")).toBeNull();
  });
});
