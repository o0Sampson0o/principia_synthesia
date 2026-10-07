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
 * Client, for the scroll-spy. Watching only the headings is not enough: in a
 * long section no heading is on screen, so scrolling back up leaves the marker
 * on the later heading until the earlier one reappears, and a page restored
 * mid-section marks nothing. Instead every block of prose is observed through
 * a thin band at reading height, and whichever block crosses it is walked back
 * to the heading that owns it.
 *
 * Adapted from Starlight's <starlight-toc> (MIT, © Astro contributors):
 * https://github.com/withastro/starlight/blob/main/packages/starlight/src/components-internals/TableOfContents/starlight-toc.ts
 */
export default function ArticleSectionRail({ entries }: { entries: TocEntry[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // Both reading routes put ArticleBody inside .ps-doc; the rail is its sibling.
    const root = document.querySelector<HTMLElement>(".ps-doc .markdown-content");
    if (!root || entries.length === 0) return;

    // Match rail headings by id, not by tag: the renderer demotes heading
    // levels when an article has its own `#`s, so a rail entry can be an h4.
    const HEADING = entries.map((e) => `#${CSS.escape(e.id)}`).join();

    /** The heading a block belongs to: itself, or the nearest one before it. */
    const owningHeading = (start: Element): HTMLElement | null => {
      let el: Element | null = start;
      while (el && el !== root) {
        if (el.matches(HEADING)) return el as HTMLElement;
        // Step to the previous sibling's deepest last descendant, so a heading
        // nested at the end of an earlier block is still found; else climb.
        let prev: Element | null = el.previousElementSibling;
        while (prev?.lastElementChild) prev = prev.lastElementChild;
        el = prev ?? el.parentElement;
      }
      // Reached the top of the prose: above the first heading, nothing owns it.
      return null;
    };

    const onIntersect: IntersectionObserverCallback = (records) => {
      for (const { isIntersecting, target, boundingClientRect, rootBounds } of records) {
        // The prose as a whole drops below the band only when the reader is back
        // above it, among the title and breadcrumb: no section is current.
        if (target === root) {
          if (!isIntersecting && rootBounds && boundingClientRect.top > rootBounds.top) {
            setActiveId(null);
          }
          continue;
        }
        if (!isIntersecting) continue;
        setActiveId(owningHeading(target)?.id ?? null);
        break;
      }
    };

    // Headings, everything after a heading at its own level, and top-level
    // blocks — skipping any block that contains a heading, whose children are
    // already covered.
    const targets = root.querySelectorAll(
      [
        `:scope :where(${HEADING})`,
        `:scope :where(${HEADING}) ~ *:not(:has(${HEADING}))`,
        `:scope > *:not(:has(${HEADING}))`,
      ].join()
    );

    // A 53px band starting 2rem below the sticky nav — slightly taller than the
    // largest gap between prose blocks, so some block is always crossing it.
    const rootMargin = () => {
      const nav = document.querySelector("nav.nav-glass")?.getBoundingClientRect().height ?? 48;
      const top = nav + 32;
      const bottom = top + 53;
      return `-${top}px 0px ${bottom - document.documentElement.clientHeight}px 0px`;
    };

    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer = new IntersectionObserver(onIntersect, { rootMargin: rootMargin() });
      targets.forEach((t) => observer!.observe(t));
      observer.observe(root);
    };
    observe();

    // The band is in pixels of viewport height, so rebuild it after a resize.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      observer?.disconnect();
      clearTimeout(timer);
      timer = setTimeout(observe, 200);
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer?.disconnect();
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
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
