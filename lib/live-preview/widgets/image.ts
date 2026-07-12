import { WidgetType } from "@codemirror/view";

/**
 * Inline image widget for `![alt](src)`. A plain <img> — next/image can't
 * mount inside CodeMirror's DOM. CM re-measures line heights when the image
 * loads, so no fixed height is needed.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super();
  }
  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-lp-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.loading = "lazy";
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent(): boolean {
    return false;
  }
}
