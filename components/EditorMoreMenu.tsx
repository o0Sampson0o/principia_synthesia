"use client";

import { useId, useRef } from "react";

/**
 * The editor's less-used tools, out of the toolbar's way: grammar checking
 * and the full-pipeline MDX check. A native popover (top layer), positioned
 * under its button — the editor frame clips anything that overflows it.
 */
export default function EditorMoreMenu({
  grammarOn,
  onToggleGrammar,
  onCheckMdx,
}: {
  grammarOn: boolean;
  onToggleGrammar: () => void;
  onCheckMdx: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  function place() {
    const b = buttonRef.current?.getBoundingClientRect();
    const m = menuRef.current;
    if (!b || !m) return;
    m.style.top = `${b.bottom + 6}px`;
    m.style.left = `${Math.max(8, b.right - 224)}px`;
  }
  const run = (fn: () => void) => () => {
    menuRef.current?.hidePopover();
    fn();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={id}
        onClick={place}
        className="ps-editor-more"
        aria-label="More editor tools"
        title="More tools"
      >
        ···
      </button>
      <div ref={menuRef} id={id} popover="auto" className="ps-editor-menu" role="menu">
        <button type="button" role="menuitemcheckbox" aria-checked={grammarOn} onClick={run(onToggleGrammar)}>
          <span>Grammar &amp; spelling</span>
          <span className="ps-mono-micro themed-muted">{grammarOn ? "on" : "off"}</span>
        </button>
        <button type="button" role="menuitem" onClick={run(onCheckMdx)}>
          <span>Check MDX</span>
          <span className="ps-mono-micro themed-muted">compile</span>
        </button>
      </div>
    </>
  );
}
