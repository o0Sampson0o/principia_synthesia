import { WidgetType } from "@codemirror/view";
import { buildAnimationSrc } from "@/lib/useAnimationSrc";

/**
 * Live-preview widget for `<DynamicAnimation publisher="…" slug="anim-…" />`.
 *
 * Click-to-load: the widget first renders a lightweight placeholder card with
 * a Load button. Only when the author clicks Load does the sandboxed iframe
 * mount — so heavy animations never slow down typing or scrolling. Clicking
 * anywhere else on the card places the cursor and reveals the source (the
 * Load button stops propagation so it doesn't).
 */
export class AnimationWidget extends WidgetType {
  constructor(
    readonly publisher: string,
    readonly slug: string
  ) {
    super();
  }
  eq(other: AnimationWidget): boolean {
    return other.publisher === this.publisher && other.slug === this.slug;
  }
  toDOM(): HTMLElement {
    const card = document.createElement("div");
    card.className = "cm-lp-animation";

    const label = document.createElement("span");
    label.className = "cm-lp-animation-label";
    label.textContent = `Animation · ${this.slug}`;

    const load = document.createElement("button");
    load.type = "button";
    load.className = "cm-lp-animation-load";
    load.textContent = "▶ Load";
    load.addEventListener("mousedown", (e) => {
      // Don't let CM place the cursor / reveal source; just mount the iframe.
      e.preventDefault();
      e.stopPropagation();
      const iframe = document.createElement("iframe");
      iframe.src = buildAnimationSrc(this.publisher, this.slug);
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.className = "cm-lp-animation-frame";
      iframe.title = `Animation: ${this.slug}`;
      card.replaceChildren(iframe);
    });

    card.append(label, load);
    return card;
  }
  ignoreEvent(): boolean {
    return false; // background clicks place the cursor → source reveals
  }
}
