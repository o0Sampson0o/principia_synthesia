import { WidgetType } from "@codemirror/view";
import { buildAnimationSrc } from "@/lib/useAnimationSrc";
import {
  ANIMATION_HEIGHT_MESSAGE,
  DEFAULT_ANIMATION_HEIGHT,
  normalizeAnimationHeight,
} from "@/lib/animation-dimensions";

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
  /** Live height listener, while a frame is mounted. */
  private onMessage: ((event: MessageEvent) => void) | null = null;

  constructor(
    readonly publisher: string,
    readonly slug: string
  ) {
    super();
  }

  /** Drops the height listener. Safe to call more than once. */
  private detach(): void {
    if (!this.onMessage) return;
    window.removeEventListener("message", this.onMessage);
    this.onMessage = null;
  }

  /** CodeMirror's teardown hook — fires when the widget's DOM is discarded. */
  destroy(): void {
    this.detach();
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

      iframe.style.height = `${DEFAULT_ANIMATION_HEIGHT}px`;

      // The frame reports its stored height on load. Sandboxed without
      // allow-same-origin, so its origin is opaque — identify it by window.
      // The frame posts once, so the listener retires itself.
      this.onMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        if (!event.data || event.data.type !== ANIMATION_HEIGHT_MESSAGE) return;
        iframe.style.height = `${normalizeAnimationHeight(event.data.height)}px`;
        this.detach();
      };
      window.addEventListener("message", this.onMessage);

      card.replaceChildren(iframe);
    });

    card.append(label, load);
    return card;
  }
  ignoreEvent(): boolean {
    return false; // background clicks place the cursor → source reveals
  }
}
