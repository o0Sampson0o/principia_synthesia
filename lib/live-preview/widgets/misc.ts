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
