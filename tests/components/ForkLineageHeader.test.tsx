import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ForkLineageHeader from "@/components/ForkLineageHeader";

describe("ForkLineageHeader", () => {
  it("renders the original article title and author", () => {
    render(
      <ForkLineageHeader
        originalTitle="Introduction to Topology"
        originalAuthorDisplayName="Alice Smith"
        originalPublisherSlug="alice"
        originalArticleSlug="article-intro-topology"
      />
    );

    expect(screen.getByText(/Forked from/)).toBeInTheDocument();
    expect(screen.getByText(/Introduction to Topology/)).toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute(
      "href",
      "/alice/articles/article-intro-topology"
    );
  });
});
