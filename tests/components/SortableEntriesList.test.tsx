import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock dnd-kit so the component renders without a real pointer/sensor environment
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

// Mock the server action used inside the component
vi.mock("@/app/admin/actions", () => ({
  removeCurriculumEntry: vi.fn(),
  reorderCurriculumEntries: vi.fn(),
}));

import SortableEntriesList from "@/app/admin/curriculum/SortableEntriesList";

const BOOK_SLUG = "test-book";

function makeEntry(id: number, title: string, position: number, isInternal = false) {
  return {
    id,
    position,
    partTitle: null,
    bookSlug: BOOK_SLUG,
    article: { slug: `article-${id}`, title, isInternal },
  };
}

describe("SortableEntriesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all entry titles passed in props", () => {
    const entries = [
      makeEntry(1, "Introduction", 0),
      makeEntry(2, "Chapter One", 1),
      makeEntry(3, "Conclusion", 2),
    ];

    render(<SortableEntriesList bookSlug={BOOK_SLUG} entries={entries} />);

    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
    expect(screen.getByText("Conclusion")).toBeInTheDocument();
  });

  it("renders a drag handle button for each entry", () => {
    const entries = [
      makeEntry(1, "Alpha", 0),
      makeEntry(2, "Beta", 1),
    ];

    render(<SortableEntriesList bookSlug={BOOK_SLUG} entries={entries} />);

    const handles = screen.getAllByRole("button", { name: /drag to reorder/i });
    expect(handles).toHaveLength(2);
  });

  it("renders a remove button for each entry", () => {
    const entries = [
      makeEntry(1, "Alpha", 0),
      makeEntry(2, "Beta", 1),
      makeEntry(3, "Gamma", 2),
    ];

    render(<SortableEntriesList bookSlug={BOOK_SLUG} entries={entries} />);

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons).toHaveLength(3);
  });
});
