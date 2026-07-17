import type { TocEntry } from "@/lib/article-toc";

/** Show a contents block only when an article has this many sections. */
const TOC_THRESHOLD = 4;

/**
 * Collapsible table of contents for long articles — a hairline-framed
 * <details> block ("Contents"), closed by default so the prose stays the
 * first thing a reader meets. Links target the rehype-slug ids on headings.
 */
export default function ArticleToc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < TOC_THRESHOLD) return null;

  return (
    <details className="md-toc">
      <summary>
        <span className="ps-eyebrow" style={{ fontSize: "0.6875rem" }}>
          Contents
        </span>
        <span className="themed-muted ps-mono-meta">
          {entries.length} sections
        </span>
      </summary>
      <ol>
        {entries.map((e, i) => (
          <li key={`${e.id}-${i}`} data-depth={e.depth}>
            <a href={`#${e.id}`}>{e.text}</a>
          </li>
        ))}
      </ol>
    </details>
  );
}
