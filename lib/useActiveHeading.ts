"use client";

import { useEffect, useState } from "react";
import type { TocEntry } from "@/lib/article-toc";

/** How far below the sticky chrome the reading line sits, px. */
const READING_LINE_OFFSET = 85;

/**
 * Scroll-spy: the id of the section the reader is in — the last listed heading
 * whose top has passed the reading line — or null above the first heading.
 * Shared by the section rail (wide) and the sticky Sections bar (narrow), so
 * the two never disagree.
 *
 * A position rule rather than an IntersectionObserver band. Observing only the
 * headings left the marker wrong when scrolling back up through a long section
 * (no heading crosses the band); observing every prose block (Starlight's
 * approach) only works when the band is taller than every gap between blocks,
 * and our rhythm — the margin above a `#`, tall callouts and display maths —
 * left gaps it could sit in. Comparing heading positions to one line has
 * neither failure: in a long section the heading above is still above it.
 * Per frame that is one rect read per heading, and the list is short.
 */
export function useActiveHeading(entries: TocEntry[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // Match headings by id, not by tag: the renderer demotes heading levels
    // when an article has its own `#`s, so a listed heading can be an h4.
    // TOC order is document order, so the scan can stop at the first heading
    // still below the line.
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // The chrome is the nav plus, on narrow layouts, the sticky Sections bar
    // (display:none on wide ones, so it measures 0 there).
    const readingLine = () => {
      const nav = document.querySelector("nav.nav-glass")?.getBoundingClientRect().height ?? 48;
      const bar = document.querySelector(".ps-doc .md-toc > summary")?.getBoundingClientRect().height ?? 0;
      return nav + bar + READING_LINE_OFFSET;
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const line = readingLine();
      let current: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top > line) break;
        current = h.id;
      }
      setActiveId(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [entries]);

  return activeId;
}
