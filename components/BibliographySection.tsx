import type { ResolvedCitation } from "@/lib/remark-cite-numbering";

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

  return (
    <section className="mt-12 pt-6 border-t themed-border" aria-label="Bibliography">
      <h2 className="text-lg font-semibold mb-4">References</h2>
      <ol className="list-decimal list-inside space-y-2 text-sm">
        {orderedSlugs.map((slug, i) => {
          const entry = resolved.get(slug);
          return (
            <li key={slug}>
              {entry ? (
                <a href={entry.href} className="themed-link hover:underline">
                  {entry.title}
                </a>
              ) : (
                <span className="opacity-60 italic">
                  [{i + 1}] Unknown article: {slug}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
