import { WidgetType } from "@codemirror/view";

/**
 * Renders `<Cite slug="publisher/article-slug" />` as the same `[n]`
 * superscript the published page shows. Numbering is computed client-side in
 * first-appearance order (lib/mdx-cite-numbering — the identical algorithm
 * the publish pipeline uses); title resolution stays server-side, so the chip
 * links nowhere and shows the slug as its tooltip.
 */
export class CiteChipWidget extends WidgetType {
  constructor(
    readonly slug: string,
    readonly number: number
  ) {
    super();
  }
  eq(other: CiteChipWidget): boolean {
    return other.slug === this.slug && other.number === this.number;
  }
  toDOM(): HTMLElement {
    const sup = document.createElement("sup");
    sup.className = "cm-lp-cite";
    sup.textContent = `[${this.number}]`;
    sup.title = this.slug;
    return sup;
  }
  ignoreEvent(): boolean {
    return false; // clicks place the cursor → source reveals
  }
}
