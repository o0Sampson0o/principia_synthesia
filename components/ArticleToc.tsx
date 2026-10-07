"use client";

import { useEffect, useRef } from "react";
import type { TocEntry } from "@/lib/article-toc";
import { useActiveHeading } from "@/lib/useActiveHeading";
import TocLabel from "@/components/TocLabel";

/** Show a contents block only when an article has this many headings. */
const TOC_THRESHOLD = 2;

/**
 * The article's own headings for layouts too narrow for the section rail — a
 * hairline-framed <details> above the prose, closed by default so the prose
 * stays the first thing a reader meets. Links target the rehype-slug ids on
 * headings.
 *
 * It sticks under the nav as the reader scrolls, and its summary names the
 * section they are in, so the narrow layout keeps the "where am I" that the
 * rail gives wide ones. Open, the list floats over the prose rather than
 * pushing it down. Without JavaScript it is still a working disclosure.
 *
 * Labelled "Sections", never "Contents": inside a book this sits below the
 * spine, whose heading is "Book contents". Two lists a screen apart both
 * called "Contents" read as the same list rendered twice.
 */
export default function ArticleToc({ entries }: { entries: TocEntry[] }) {
  const activeId = useActiveHeading(entries);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Close on a click outside, and on Escape — returning focus to the summary
  // if it was inside, so keyboard users are not dropped at the top of the page.
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onClick = (e: MouseEvent) => {
      if (details.open && !details.contains(e.target as Node)) details.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !details.open) return;
      const hadFocus = details.contains(document.activeElement);
      details.open = false;
      if (hadFocus) details.querySelector("summary")?.focus();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (entries.length < TOC_THRESHOLD) return null;

  const active = entries.find((e) => e.id === activeId);

  return (
    <details ref={detailsRef} className="md-toc">
      <summary>
        <span className="ps-eyebrow" style={{ fontSize: "0.6875rem" }}>
          Sections
        </span>
        {active ? (
          <span className="md-toc-current">
            <TocLabel entry={active} />
          </span>
        ) : (
          <span className="themed-muted ps-mono-meta">{entries.length}</span>
        )}
      </summary>
      <ol
        // Following a link means the reader has arrived: fold the list away.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a") && detailsRef.current) {
            detailsRef.current.open = false;
          }
        }}
      >
        {entries.map((e, i) => (
          <li key={`${e.id}-${i}`} data-depth={e.depth}>
            <a href={`#${e.id}`} aria-current={activeId === e.id ? "location" : undefined}>
              <TocLabel entry={e} />
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}
