import type { ResolvedCitation } from "@/lib/remark-cite-numbering";
import SectionHeader from "./SectionHeader";

interface Props {
  orderedSlugs: string[];
  resolved: Map<string, ResolvedCitation>;
}

/**
 * Renders a numbered bibliography for all <Cite> elements in the article body.
 * Shown only when there is at least one citation.
 */
export default function BibliographySection({ orderedSlugs, resolved }: Props) {
  if (orderedSlugs.length === 0) return null;

  const n = orderedSlugs.length;
  return (
    <section className="mt-16">
      <SectionHeader title="References" count={`${n} ${n === 1 ? "source" : "sources"}`} />
      <ol className="list-decimal list-inside space-y-2 text-sm mt-4">
        {orderedSlugs.map((slug) => {
          const entry = resolved.get(slug);
          return (
            <li key={slug}>
              {entry ? (
                <a href={entry.href} className="themed-link hover:underline">
                  {entry.title}
                </a>
              ) : (
                // Slug only in title (for editors hunting the broken ref);
                // readers just see that the reference is unavailable.
                <span className="opacity-60 italic" title={slug}>
                  Unresolved reference
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
