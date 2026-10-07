"use client";

import type { TocEntry } from "@/lib/article-toc";
import { useActiveHeading } from "@/lib/useActiveHeading";
import TocLabel from "@/components/TocLabel";

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
 * Client, for the scroll-spy (useActiveHeading), which marks the section the
 * reader is in.
 */
export default function ArticleSectionRail({ entries }: { entries: TocEntry[] }) {
  const activeId = useActiveHeading(entries);

  if (entries.length < RAIL_THRESHOLD) return null;

  return (
    <aside className="ps-section-rail" aria-label="On this page">
      <ol>
        {/* A way back to the start, current while the reader is above the
            first heading. #top scrolls to the top of the document when no
            element has that id (HTML's "top" fragment rule). */}
        <li data-depth={1}>
          <a href="#top" aria-current={activeId === null ? "location" : undefined}>
            Overview
          </a>
        </li>
        {entries.map((e, i) => (
          <li key={`${e.id}-${i}`} data-depth={e.depth}>
            <a
              href={`#${e.id}`}
              aria-current={activeId === e.id ? "location" : undefined}
            >
              <TocLabel entry={e} />
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}
