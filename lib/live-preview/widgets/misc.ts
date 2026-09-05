import { WidgetType } from "@codemirror/view";

/** Replaces a bullet ListMark with the em-dash marker used by .markdown-content. */
export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true; // all bullets are identical
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-bullet";
    span.textContent = "—";
    return span;
  }
  ignoreEvent(): boolean {
    return false; // let clicks place the cursor
  }
}

/** Replaces a HorizontalRule line with the editorial "· · ·" divider. */
export class HrWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-hr";
    span.textContent = "· · ·";
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Replaces a prose `\eqref{key}` with the equation number it resolves to.
 *
 * Prose references are rewritten to markdown links server-side, so without
 * this the live editor is the one surface that still shows the raw command —
 * the same LIVE/published split this feature exists to remove. Rendered as
 * plain text rather than an anchor: inside an editor a link is something you
 * are editing, not something to follow.
 */
export class EqRefWidget extends WidgetType {
  constructor(readonly label: string, readonly number: number) {
    super();
  }
  eq(other: EqRefWidget): boolean {
    return other.label === this.label && other.number === this.number;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-eqref";
    span.textContent = `(${this.number})`;
    span.title = `Equation ${this.number} — ${this.label}`;
    return span;
  }
  ignoreEvent(): boolean {
    return false; // clicks place the cursor → source reveals
  }
}
