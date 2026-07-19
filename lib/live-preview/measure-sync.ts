import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Keeps CodeMirror's height geometry in sync with block widgets whose rendered
 * height settles AFTER they mount — chiefly KaTeX math, which reflows when the
 * KaTeX web fonts load. CM measures a block widget's height once and caches it;
 * without a nudge to re-measure, the cached height diverges from the real one
 * and the error accumulates down the document, so clicks land on the wrong line
 * and vertical cursor motion overshoots.
 *
 * Two triggers:
 *  - `document.fonts.ready` → a one-shot re-measure once the math fonts swap in.
 *  - a `ResizeObserver` on the content DOM → re-measure whenever rendered
 *    content changes height (a widget's KaTeX reflow grows `.cm-content`),
 *    debounced through rAF so it never loops with CM's own measure pass.
 */
const measureSyncPlugin = ViewPlugin.fromClass(
  class {
    private ro: ResizeObserver | null = null;
    private raf = 0;

    constructor(view: EditorView) {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        document.fonts.ready.then(() => view.requestMeasure()).catch(() => {});
      }
      if (typeof ResizeObserver !== "undefined") {
        this.ro = new ResizeObserver(() => {
          cancelAnimationFrame(this.raf);
          this.raf = requestAnimationFrame(() => view.requestMeasure());
        });
        this.ro.observe(view.contentDOM);
      }
    }

    destroy() {
      this.ro?.disconnect();
      cancelAnimationFrame(this.raf);
    }
  }
);

export const measureSync: Extension = measureSyncPlugin;
