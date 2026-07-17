import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EditorView } from "@codemirror/view";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { diagnosticAt, openSuggestionMenu } from "@/lib/codemirror-grammar";

// jsdom has no layout, so posAtCoords (exercised only in the browser) is not
// covered here; these tests drive the exported lookup + menu directly.

const DOC = "Miletus is under Ionia region";
const IONIA = { from: DOC.indexOf("Ionia"), to: DOC.indexOf("Ionia") + "Ionia".length };

function makeView(): EditorView {
  const view = new EditorView({ doc: DOC, parent: document.body });
  const diagnostic: Diagnostic & { expected: string[] } = {
    ...IONIA,
    severity: "warning",
    source: "retext-spell",
    message: "Unexpected unknown word `Ionia`",
    expected: ["Ionian", "Ionic"],
  };
  view.dispatch(setDiagnostics(view.state, [diagnostic]));
  return view;
}

function menuEl(): HTMLElement | null {
  return document.querySelector(".cm-grammar-menu");
}

describe("diagnosticAt", () => {
  let view: EditorView;
  beforeEach(() => {
    view = makeView();
  });
  afterEach(() => {
    view.destroy();
    document.body.innerHTML = "";
  });

  it("returns the diagnostic range and suggestions at a covered position", () => {
    expect(diagnosticAt(view.state, IONIA.from + 2)).toEqual({
      ...IONIA,
      expected: ["Ionian", "Ionic"],
    });
  });

  it("returns null outside any diagnostic", () => {
    expect(diagnosticAt(view.state, 0)).toBeNull();
  });
});

describe("openSuggestionMenu", () => {
  let view: EditorView;
  beforeEach(() => {
    view = makeView();
  });
  afterEach(() => {
    // Close any menu a failed assertion left open (detaches window listeners).
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.innerHTML = "";
    view.destroy();
  });

  it("lists each suggestion as a menu item", () => {
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 10, 10);
    const items = [...document.querySelectorAll(".cm-grammar-menu-item")];
    expect(items.map((el) => el.textContent)).toEqual(["Ionian", "Ionic"]);
  });

  it("replaces the underlined range and closes when a suggestion is clicked", () => {
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 10, 10);
    (document.querySelectorAll(".cm-grammar-menu-item")[0] as HTMLButtonElement).click();
    expect(view.state.doc.toString()).toBe("Miletus is under Ionian region");
    expect(menuEl()).toBeNull();
  });

  it("closes on Escape without changing the document", () => {
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 10, 10);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menuEl()).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  it("navigates with arrows and applies with Enter", () => {
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 10, 10);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(view.state.doc.toString()).toBe("Miletus is under Ionic region");
    expect(menuEl()).toBeNull();
  });

  it("shows a disabled placeholder when there are no suggestions", () => {
    openSuggestionMenu(view, { ...IONIA, expected: [] }, 10, 10);
    expect(menuEl()?.textContent).toBe("No suggestions");
    expect(document.querySelector(".cm-grammar-menu-item")).toBeNull();
  });

  it("only ever shows one menu at a time", () => {
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 10, 10);
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 20, 20);
    expect(document.querySelectorAll(".cm-grammar-menu").length).toBe(1);
  });

  it("closes when the user starts typing", () => {
    openSuggestionMenu(view, diagnosticAt(view.state, IONIA.from)!, 10, 10);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(menuEl()).toBeNull();
  });
});
