"use client";

import { useEffect, useState } from "react";
import type { TocEntry } from "@/lib/article-toc";

/** Match ArticleToc: one heading is not a structure worth a rail. */
const RAIL_THRESHOLD = 2;

/**
 * The page's own headings, pinned to the right of the prose.
 *
 * Deliberately unlabelled. A visible "Sections" heading competes with the
 * spine's "Book contents" a few hundred pixels away and reads as a second
 * table of contents; the hairline rule and the indentation already say what
 * this is. The accessible name is carried by aria-label instead, so screen
 * readers still get one.
 *
 * Client, for the scroll-spy: an IntersectionObserver marks whichever heading
 * currently owns the top of the viewport. The rootMargin band starts just
 * below the sticky nav and ends 70% down, so the active item changes when a
 * heading reaches reading position rather than when it first appears.
 */
export default function ArticleSectionRail({ entries }: { entries: TocEntry[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (records) => {
        const inBand = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        // Only move the marker when something is in the band; leaving it put
        // avoids the highlight blanking out mid-section on a long passage.
        if (inBand.length > 0) setActiveId(inBand[0].target.id);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [entries]);

  if (entries.length < RAIL_THRESHOLD) return null;

  return (
    <aside className="ps-section-rail" aria-label="On this page">
      <ol>
        {entries.map((e, i) => (
          <li key={`${e.id}-${i}`} data-depth={e.depth}>
            <a
              href={`#${e.id}`}
              aria-current={activeId === e.id ? "location" : undefined}
            >
              {e.text}
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}
