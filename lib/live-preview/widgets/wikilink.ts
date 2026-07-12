import { WidgetType } from "@codemirror/view";
import { parseWikilink } from "@/lib/wikilink-syntax";

/**
 * Renders `[[publisher:type:slug|Label]]` as a link chip. A plain click
 * places the cursor (CM reveals the source since boundaries are inclusive);
 * Mod-click (Ctrl/Cmd) opens the target in a new tab.
 */
export class WikilinkChipWidget extends WidgetType {
  constructor(readonly raw: string) {
    super();
  }
  eq(other: WikilinkChipWidget): boolean {
    return other.raw === this.raw;
  }
  toDOM(): HTMLElement {
    const parsed = parseWikilink(this.raw);
    const chip = document.createElement("span");
    chip.className = "cm-lp-wikilink";
    chip.textContent = parsed?.display ?? this.raw;
    if (parsed) {
      chip.title = `${parsed.href} — Ctrl+click to open`;
      chip.addEventListener("mousedown", (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          window.open(parsed.href, "_blank", "noopener");
        }
      });
    }
    return chip;
  }
  ignoreEvent(event: Event): boolean {
    // Handle Mod-clicks ourselves; let CM place the cursor for plain clicks.
    return event instanceof MouseEvent && (event.ctrlKey || event.metaKey);
  }
}
