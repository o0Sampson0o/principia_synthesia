import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ArticleImage from "@/components/ArticleImage";

// Mock next/image to render a plain <img> we can inspect
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, sizes, unoptimized, ...rest } = props;
    return (
      // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
      <img
        data-testid="next-image"
        data-unoptimized={String(unoptimized)}
        data-fill={fill ? "true" : undefined}
        data-sizes={sizes as string | undefined}
        {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
      />
    );
  },
}));

// Suppress React import warning from JSX transform in mock
import React from "react";

describe("ArticleImage", () => {
  it("renders nothing when src is missing", () => {
    const { container } = render(<ArticleImage />);
    expect(container.firstChild).toBeNull();
  });

  it("uses unoptimized=false for blob URLs with dimensions", () => {
    render(
      <ArticleImage
        src="https://abc.public.blob.vercel-storage.com/x.png"
        alt="x"
        width={200}
        height={150}
      />
    );
    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute("data-unoptimized", "false");
  });

  it("uses unoptimized=true for external URLs with dimensions", () => {
    render(
      <ArticleImage
        src="https://example.com/x.png"
        alt="x"
        width={200}
        height={150}
      />
    );
    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute("data-unoptimized", "true");
  });

  it("uses fill mode inside a responsive container when no dimensions are provided", () => {
    const { container } = render(
      <ArticleImage src="https://example.com/x.png" alt="x" />
    );
    const img = screen.getByTestId("next-image");
    expect(img).toHaveAttribute("data-fill", "true");
    // The wrapper div should have an inline style with aspect-ratio
    const wrapper = container.querySelector("div.relative");
    expect(wrapper).not.toBeNull();
    expect((wrapper as HTMLElement).style.aspectRatio).toBe("16 / 9");
  });

  it("renders a figcaption with the title when provided", () => {
    render(
      <ArticleImage
        src="https://example.com/x.png"
        alt="x"
        width={100}
        height={100}
        title="A caption"
      />
    );
    const caption = screen.getByText("A caption");
    expect(caption.tagName.toLowerCase()).toBe("figcaption");
  });

  it("does not render a figcaption when no title is provided", () => {
    render(
      <ArticleImage src="https://example.com/x.png" alt="x" width={100} height={100} />
    );
    expect(screen.queryByRole("figure")).not.toBeNull();
    expect(document.querySelector("figcaption")).toBeNull();
  });
});
