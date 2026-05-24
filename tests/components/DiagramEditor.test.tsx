import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      data-testid="codemirror"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock("@/components/DiagramRenderer", () => ({
  default: ({ format, source }: { format: string; source: string }) => (
    <div data-testid="diagram-renderer" data-format={format} data-source={source} />
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import DiagramEditor from "@/components/DiagramEditor";

describe("DiagramEditor", () => {
  it("renders format select with mermaid and graphviz options", () => {
    render(<DiagramEditor />);
    const select = screen.getByRole("combobox", { name: /format/i });
    expect(select).not.toBeNull();
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain("mermaid");
    expect(options).toContain("graphviz");
  });

  it("defaults to mermaid format", () => {
    render(<DiagramEditor />);
    const select = screen.getByRole("combobox", { name: /format/i }) as HTMLSelectElement;
    expect(select.value).toBe("mermaid");
  });

  it("renders with initialFormat=graphviz", () => {
    render(<DiagramEditor initialFormat="graphviz" initialSource="digraph G {}" />);
    const select = screen.getByRole("combobox", { name: /format/i }) as HTMLSelectElement;
    expect(select.value).toBe("graphviz");
  });

  it("includes a hidden input named 'source' with initial value", () => {
    render(<DiagramEditor initialSource="graph TD; A-->B" />);
    const hidden = document.querySelector('input[name="source"]') as HTMLInputElement | null;
    expect(hidden).not.toBeNull();
    expect(hidden!.value).toBe("graph TD; A-->B");
  });

  it("has a select named 'format'", () => {
    render(<DiagramEditor initialFormat="mermaid" />);
    const select = document.querySelector('select[name="format"]') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select!.value).toBe("mermaid");
  });

  it("changing format select updates the value", () => {
    render(<DiagramEditor initialFormat="mermaid" />);
    const select = screen.getByRole("combobox", { name: /format/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "graphviz" } });
    expect(select.value).toBe("graphviz");
  });

  it("renders preview area with aria-label", () => {
    render(<DiagramEditor />);
    const preview = document.querySelector('[aria-label="Diagram preview"]');
    expect(preview).not.toBeNull();
  });

  it("renders source editor area with aria-label", () => {
    render(<DiagramEditor />);
    const editor = document.querySelector('[aria-label="Diagram source editor"]');
    expect(editor).not.toBeNull();
  });

  it("form fields for format and source are present with correct values", () => {
    render(<DiagramEditor initialFormat="mermaid" initialSource="graph TD; A-->B" />);
    const formatSelect = document.querySelector('select[name="format"]') as HTMLSelectElement;
    const sourceInput = document.querySelector('input[name="source"]') as HTMLInputElement;
    expect(formatSelect.value).toBe("mermaid");
    expect(sourceInput.value).toBe("graph TD; A-->B");
  });
});
