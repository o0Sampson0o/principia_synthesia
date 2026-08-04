"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** The exact text placed on the clipboard. */
  value: string;
  /** Button text before copying. */
  label: string;
  /** Announced and shown briefly after a successful copy. */
  copiedLabel?: string;
  /** Shown on hover as a preview of what will be copied. Defaults to `value`. */
  title?: string;
}

/**
 * One-click copy for a short snippet — a wikilink, an MDX tag.
 *
 * Rendered as a quiet action so it sits in a meta row without competing with
 * the content. The label swaps to a confirmation for a moment; the live region
 * carries that to screen readers, since a colour/text change alone is silent.
 */
export default function CopySnippet({ value, label, copiedLabel = "Copied", title }: Props) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The timeout outlives a fast unmount (navigating away right after copying),
  // so clear it rather than setting state on a gone component.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
    } catch {
      // Insecure context, or permission denied — say so instead of looking
      // like it worked. The snippet is in the title attribute either way.
      setFailed(true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1600);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="ps-quiet-action"
        title={title ?? value}
      >
        {failed ? "Press ⌘C" : copied ? copiedLabel : label}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${copiedLabel}: ${value}` : failed ? "Copy failed" : ""}
      </span>
    </>
  );
}
