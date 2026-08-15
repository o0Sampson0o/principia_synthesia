import DynamicAnimation from "@/components/DynamicAnimation";
import DiagramRenderer from "@/components/DiagramRenderer";
import { isDiagramContent, isDatasetContent, type KaoContent } from "@/lib/kao";

interface Props {
  publisher: string;
  slug: string;
  type: string;
  content: KaoContent;
}

/**
 * Renders a KAO object's body — the one place that decides what an animation,
 * a dataset, or a diagram looks like.
 *
 * Used by the object's own page and by `<Embed>`, so an object embedded in an
 * article and the same object viewed on its page are the same rendering. Adding
 * a new object type means adding it here once.
 */
export default function ObjectRender({ publisher, slug, type, content }: Props) {
  if (type === "animation") {
    return <DynamicAnimation publisher={publisher} slug={slug} />;
  }

  if (type === "dataset" && isDatasetContent(content)) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse themed-surface rounded">
          <thead>
            <tr>
              {content.headers.map((h, i) => (
                <th
                  key={i}
                  className="border themed-border px-3 py-2 text-left font-semibold themed-muted-bg"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row, ri) => (
              <tr key={ri} className="even:[background:var(--muted)]">
                {row.map((cell, ci) => (
                  <td key={ci} className="border themed-border px-3 py-2">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "diagram" && isDiagramContent(content)) {
    return <DiagramRenderer format={content.format} source={content.source} />;
  }

  return null;
}
