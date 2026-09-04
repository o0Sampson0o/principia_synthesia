import type { TocEntry } from "@/lib/article-toc";

/** Show a contents block only when an article has this many headings. */
const TOC_THRESHOLD = 2;

/**
 * Collapsible list of an article's own headings — a hairline-framed <details>
 * block, closed by default so the prose stays the first thing a reader meets.
 * Links target the rehype-slug ids on headings.
 *
 * Labelled "Sections", never "Contents": inside a book this sits below the
 * spine, whose heading is "Book contents". Two lists a screen apart both
 * called "Contents" read as the same list rendered twice.
 */
export default function ArticleToc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < TOC_THRESHOLD) return null;

  return (
    <details className="md-toc">
      <summary>
        <span className="ps-eyebrow" style={{ fontSize: "0.6875rem" }}>
          Sections
        </span>
        <span className="themed-muted ps-mono-meta">
          {entries.length}
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
