import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CitationModal from "@/components/CitationModal";
import type { CitationInput } from "@/lib/citations";

const baseProps: Omit<CitationInput, "accessedAt"> & { onClose: () => void } = {
  authorDisplayName: "Alice Smith",
  authorPublisherSlug: "alice",
  title: "Introduction to Topology",
  publishedAt: new Date("2025-03-15T00:00:00.000Z"),
  url: "https://principia-synthesia.com/alice/articles/article-intro-topology",
  versionHash: null,
  onClose: vi.fn(),
};

describe("CitationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders the APA tab by default", () => {
    render(<CitationModal {...baseProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // APA tab should be active
    const apaCitation = screen.getByText(/Alice Smith\./);
    expect(apaCitation).toBeInTheDocument();
  });

  it("switches to MLA tab when clicked", () => {
    render(<CitationModal {...baseProps} />);
    const mlaTab = screen.getByRole("button", { name: "MLA" });
    fireEvent.click(mlaTab);
    // MLA format uses italic *Principia Synthesia*
    const pre = document.querySelector("pre");
    expect(pre?.textContent).toContain("*Principia Synthesia*");
  });

  it("switches to BibTeX tab when clicked", () => {
    render(<CitationModal {...baseProps} />);
    const bibtexTab = screen.getByRole("button", { name: "BibTeX" });
    fireEvent.click(bibtexTab);
    const pre = document.querySelector("pre");
    expect(pre?.textContent).toContain("@misc{");
  });

  it("calls navigator.clipboard.writeText on copy", async () => {
    render(<CitationModal {...baseProps} />);
    const copyBtn = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const callArg = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toContain("Alice Smith");
  });

  it("calls onClose when the footer Close button is clicked", () => {
    const onClose = vi.fn();
    render(<CitationModal {...baseProps} onClose={onClose} />);
    // Use getAllByRole and pick the one without aria-label (the text "Close" button)
    const buttons = screen.getAllByRole("button", { name: /close/i });
    // The footer button has text "Close", the X button has aria-label="Close"
    const footerClose = buttons.find((btn) => btn.textContent?.trim() === "Close");
    expect(footerClose).toBeDefined();
    fireEvent.click(footerClose!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
