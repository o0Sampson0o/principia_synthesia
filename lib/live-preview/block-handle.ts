import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { blockAt, deleteBlock, duplicateBlock, fencedRanges, moveBlock, type BlockRange } from "@/lib/live-preview/blocks";
import { convertLine, type BlockType } from "@/lib/live-preview/turn-into";

/**
 * Notion's ⋮⋮ block handle for the article editor. Hovering a block shows a
 * handle in the margin beside its first line:
 *  - drag it to move the block (a line marks where it will land);
 *  - click it for Turn into…, Duplicate, Move up / down and Delete.
 * Blocks are markdown blocks (lib/live-preview/blocks.ts); every action is an
 * ordinary edit, so it undoes with Ctrl+Z like typing does.
 *
 * Pointer-only by design: the keyboard already has Alt+↑/↓ (move line) and
 * Ctrl+Alt+0–9 (turn into).
 */

const TURN_INTO: [BlockType, string][] = [
  ["paragraph", "Text"],
  ["h1", "Heading 1"],
  ["h2", "Heading 2"],
  ["h3", "Heading 3"],
  ["bullet", "Bulleted list"],
  ["numbered", "Numbered list"],
  ["todo", "To-do"],
  ["quote", "Quote"],
];

/** Replace the lines that differ between `before` and `after` (one minimal change). */
function applyLines(view: EditorView, before: string[], after: string[], anchorLine: number) {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const doc = view.state.doc;
  const fromLine = p + 1;
  const toLine = before.length - s; // inclusive, 1-based
  const insertLines = after.slice(p, after.length - s);
  let from: number, to: number, insert: string;
  if (toLine >= fromLine) {
    from = doc.line(fromLine).from;
    to = doc.line(toLine).to;
    insert = insertLines.join("\n");
  } else {
    // Pure insertion before line `fromLine` (or at the end).
    from = fromLine <= doc.lines ? doc.line(fromLine).from : doc.length;
    to = from;
    insert = fromLine <= doc.lines ? insertLines.join("\n") + "\n" : "\n" + insertLines.join("\n");
  }
  view.dispatch({ changes: { from, to, insert }, scrollIntoView: true, userEvent: "move.block" });
  const line = Math.min(anchorLine + 1, view.state.doc.lines);
  view.dispatch({ selection: { anchor: view.state.doc.line(line).from } });
  view.focus();
}

class BlockHandle {
  handle: HTMLButtonElement;
  menu: HTMLDivElement;
  drop: HTMLDivElement;
  lines: string[] = [];
  fences: BlockRange[] = [];
  block: BlockRange | null = null;
  drag: { startY: number; moved: boolean; target: number | null } | null = null;

  constructor(readonly view: EditorView) {
    this.readDoc();
    const dom = view.dom;

    this.handle = document.createElement("button");
    this.handle.type = "button";
    this.handle.className = "ps-block-handle";
    this.handle.tabIndex = -1;
    this.handle.setAttribute("aria-label", "Drag to move this block, or click for block actions");
    this.handle.textContent = "⋮⋮";
    this.handle.style.display = "none";

    this.menu = document.createElement("div");
    this.menu.className = "ps-block-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.style.display = "none";

    this.drop = document.createElement("div");
    this.drop.className = "ps-block-drop";
    this.drop.style.display = "none";

    dom.append(this.handle, this.menu, this.drop);

    view.scrollDOM.addEventListener("mousemove", this.onMove);
    view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
    dom.addEventListener("mouseleave", this.onLeave);
    this.handle.addEventListener("pointerdown", this.onPointerDown);
    document.addEventListener("pointerdown", this.onOutside, true);
    document.addEventListener("keydown", this.onKey, true);
  }

  update(u: ViewUpdate) {
    if (u.docChanged) {
      this.readDoc();
      this.hide();
    }
  }

  destroy() {
    this.view.scrollDOM.removeEventListener("mousemove", this.onMove);
    this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    this.view.dom.removeEventListener("mouseleave", this.onLeave);
    document.removeEventListener("pointerdown", this.onOutside, true);
    document.removeEventListener("keydown", this.onKey, true);
    this.handle.remove();
    this.menu.remove();
    this.drop.remove();
  }

  readDoc() {
    this.lines = this.view.state.doc.toString().split("\n");
    this.fences = fencedRanges(this.lines);
  }

  /** Line index (0-based) under a viewport y. */
  lineAtY(y: number): number {
    const top = y - this.view.documentTop;
    const block = this.view.lineBlockAtHeight(top);
    return this.view.state.doc.lineAt(block.from).number - 1;
  }

  /** Viewport → editor-local y of the top of line `i` (0-based; i === length → bottom of the last). */
  lineTop(i: number): number {
    const doc = this.view.state.doc;
    const domTop = this.view.dom.getBoundingClientRect().top;
    if (i >= doc.lines) {
      const last = this.view.lineBlockAt(doc.length);
      return last.bottom + this.view.documentTop - domTop;
    }
    return this.view.lineBlockAt(doc.line(i + 1).from).top + this.view.documentTop - domTop;
  }

  onMove = (e: MouseEvent) => {
    if (this.drag || this.menu.style.display !== "none") return;
    const i = this.lineAtY(e.clientY);
    const b = blockAt(this.lines, i, this.fences);
    if (!b) {
      if (e.target !== this.handle) this.handle.style.display = "none";
      return;
    }
    this.block = b;
    const content = this.view.contentDOM.getBoundingClientRect();
    const dom = this.view.dom.getBoundingClientRect();
    const firstLine = this.view.lineBlockAt(this.view.state.doc.line(b.from + 1).from);
    // Align with the first line's first text row, in the line's left padding.
    this.handle.style.top = `${this.lineTop(b.from) + Math.min(firstLine.height, 28) / 2 - 12}px`;
    this.handle.style.left = `${Math.max(2, content.left - dom.left - 6)}px`;
    this.handle.style.display = "";
  };

  onScroll = () => this.hide();
  onLeave = (e: MouseEvent) => {
    if (this.drag || this.menu.style.display !== "none") return;
    if (e.relatedTarget instanceof Node && this.view.dom.contains(e.relatedTarget)) return;
    this.handle.style.display = "none";
  };

  hide() {
    this.handle.style.display = "none";
    this.menu.style.display = "none";
    this.drop.style.display = "none";
  }

  onOutside = (e: PointerEvent) => {
    if (this.menu.style.display === "none") return;
    if (this.menu.contains(e.target as Node) || this.handle.contains(e.target as Node)) return;
    this.menu.style.display = "none";
  };
  onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.menu.style.display !== "none") {
      this.menu.style.display = "none";
      e.stopPropagation();
    }
  };

  // ── Drag ────────────────────────────────────────────────────────────

  onPointerDown = (e: PointerEvent) => {
    if (!this.block || e.button !== 0) return;
    e.preventDefault();
    this.handle.setPointerCapture(e.pointerId);
    this.drag = { startY: e.clientY, moved: false, target: null };
    this.handle.addEventListener("pointermove", this.onDragMove);
    this.handle.addEventListener("pointerup", this.onDragEnd, { once: true });
  };

  onDragMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || !this.block) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 4) return;
    d.moved = true;
    this.menu.style.display = "none";
    this.handle.classList.add("is-dragging");
    const i = this.lineAtY(e.clientY);
    const over = blockAt(this.lines, i, this.fences);
    let target: number;
    if (!over) target = i;
    else {
      const mid = (this.lineTop(over.from) + this.lineTop(over.to + 1)) / 2;
      const y = e.clientY - this.view.dom.getBoundingClientRect().top;
      target = y < mid ? over.from : over.to + 1;
    }
    d.target = target;
    const inside = target >= this.block.from && target <= this.block.to + 1;
    this.drop.style.display = inside ? "none" : "";
    const content = this.view.contentDOM.getBoundingClientRect();
    const dom = this.view.dom.getBoundingClientRect();
    this.drop.style.top = `${this.lineTop(target) - 1}px`;
    this.drop.style.left = `${content.left - dom.left + 20}px`;
    this.drop.style.width = `${content.width - 40}px`;
  };

  onDragEnd = () => {
    const d = this.drag;
    this.handle.removeEventListener("pointermove", this.onDragMove);
    this.handle.classList.remove("is-dragging");
    this.drop.style.display = "none";
    this.drag = null;
    if (!d || !this.block) return;
    if (!d.moved) {
      this.openMenu();
      return;
    }
    if (d.target === null) return;
    const r = moveBlock(this.lines, this.block, d.target);
    if (r) applyLines(this.view, this.lines, r.lines, r.at);
  };

  // ── Menu ────────────────────────────────────────────────────────────

  openMenu() {
    const b = this.block;
    if (!b) return;
    const item = (label: string, run: () => void, hint?: string) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.innerHTML = "";
      const l = document.createElement("span");
      l.textContent = label;
      btn.append(l);
      if (hint) {
        const h = document.createElement("span");
        h.className = "ps-block-menu-hint";
        h.textContent = hint;
        btn.append(h);
      }
      btn.addEventListener("click", () => {
        this.menu.style.display = "none";
        run();
      });
      return btn;
    };
    const label = (text: string) => {
      const p = document.createElement("p");
      p.className = "ps-block-menu-label";
      p.textContent = text;
      return p;
    };

    const lines = this.lines;
    const first = lines[b.from];
    const fenced = this.fences.some((r) => r.from === b.from);
    this.menu.replaceChildren();
    if (!fenced) {
      this.menu.append(label("Turn into"));
      TURN_INTO.forEach(([type, name], k) => {
        this.menu.append(
          item(name, () => {
            const next = [...lines];
            next[b.from] = convertLine(first, type);
            applyLines(this.view, lines, next, b.from);
          }, `Ctrl+Alt+${type === "quote" ? "Q" : [0, 1, 2, 3, 7, 8, 9][k]}`)
        );
      });
      this.menu.append(document.createElement("hr"));
    }
    this.menu.append(
      item("Duplicate", () => {
        const r = duplicateBlock(lines, b);
        applyLines(this.view, lines, r.lines, r.at);
      }),
      item("Move up", () => {
        const prev = b.from > 0 ? blockAt(lines, b.from - 1, this.fences) ?? blockAt(lines, b.from - 2, this.fences) : null;
        if (!prev) return;
        const r = moveBlock(lines, b, prev.from);
        if (r) applyLines(this.view, lines, r.lines, r.at);
      }),
      item("Move down", () => {
        const next = blockAt(lines, b.to + 1, this.fences) ?? blockAt(lines, b.to + 2, this.fences);
        if (!next) return;
        const r = moveBlock(lines, b, next.to + 1);
        if (r) applyLines(this.view, lines, r.lines, r.at);
      }),
      item("Delete", () => {
        const next = deleteBlock(lines, b);
        applyLines(this.view, lines, next, Math.max(0, b.from - 1));
      })
    );
    this.menu.style.top = `${parseFloat(this.handle.style.top) + 28}px`;
    this.menu.style.left = this.handle.style.left;
    this.menu.style.display = "";
    (this.menu.querySelector("button") as HTMLButtonElement | null)?.focus();
  }
}

export const blockHandle: Extension = ViewPlugin.fromClass(BlockHandle);
