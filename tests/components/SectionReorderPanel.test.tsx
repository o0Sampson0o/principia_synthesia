import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mirror the exact dnd-kit stubs from SortableEntriesList.test.tsx
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const next = [...arr];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  }),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: { toString: vi.fn(() => undefined) },
  },
}));

vi.mock("@/app/admin/actions", () => ({
  updateArticleContent: vi.fn().mockResolvedValue({}),
}));

import SectionReorderPanel from "@/app/admin/articles/SectionReorderPanel";

const ARTICLE_SLUG = "test-article";

describe("SectionReorderPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty-state message when content has fewer than 2 sections", () => {
    // Only one ## heading means sections.length === 1, which is < 2
    const content = "Preamble text only — no headings.";
    render(<SectionReorderPanel articleSlug={ARTICLE_SLUG} initialContent={content} />);
    expect(screen.getByText(/No sections to reorder/i)).toBeInTheDocument();
  });

  it("renders the empty-state message when content has exactly one ## heading (one draggable section)", () => {
    const content = "Intro.\n\n## Only Section\n\nSome body.";
    render(<SectionReorderPanel articleSlug={ARTICLE_SLUG} initialContent={content} />);
    expect(screen.getByText(/No sections to reorder/i)).toBeInTheDocument();
  });

  it("renders a drag handle for each section when there are 2+ sections", () => {
    const content =
      "Preamble.\n\n## Section Alpha\n\nAlpha body.\n\n## Section Beta\n\nBeta body.";
    render(<SectionReorderPanel articleSlug={ARTICLE_SLUG} initialContent={content} />);
    const handles = screen.getAllByRole("button", { name: /drag to reorder/i });
    expect(handles).toHaveLength(2);
  });

  it("renders each section heading when there are 2+ sections", () => {
    const content =
      "Preamble.\n\n## Section Alpha\n\nAlpha body.\n\n## Section Beta\n\nBeta body.";
    render(<SectionReorderPanel articleSlug={ARTICLE_SLUG} initialContent={content} />);
    expect(screen.getByText("Section Alpha")).toBeInTheDocument();
    expect(screen.getByText("Section Beta")).toBeInTheDocument();
  });

  it("labels the preamble as 'Introduction / Preamble'", () => {
    const content =
      "Some intro.\n\n## Chapter One\n\nFirst.\n\n## Chapter Two\n\nSecond.";
    render(<SectionReorderPanel articleSlug={ARTICLE_SLUG} initialContent={content} />);
    expect(screen.getByText("Introduction / Preamble")).toBeInTheDocument();
  });
});
