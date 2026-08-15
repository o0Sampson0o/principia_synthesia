import DiagramRenderer from "@/components/DiagramRenderer";

/**
 * A ```mermaid fence, rendered.
 *
 * Delegates to the same `<DiagramRenderer>` a diagram *object* uses, so a
 * diagram written inline in an article and one stored as an object come out
 * identical — including the light/dark handling and the raw-source fallback
 * when Mermaid cannot parse the input.
 */
export default function MermaidBlock({ source }: { source: string }) {
  return (
    <div className="my-8">
      <DiagramRenderer format="mermaid" source={source} />
    </div>
  );
}
