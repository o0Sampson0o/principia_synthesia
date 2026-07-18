/**
 * The one section grammar for article end-matter (References, Related
 * events, Forks, Discussion): accent eyebrow heading on a hairline rule,
 * with the count set apart in the mono metadata voice (the Mono Fact Rule —
 * counts are facts, not headings).
 */
export default function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: string;
}) {
  return (
    <div className="flex items-baseline justify-between pb-3 border-b themed-border">
      {/* A half-step above the eyebrow so scrolling readers can actually
          find sections — comment bylines must not outrank their heading. */}
      <h2 className="ps-eyebrow" style={{ fontSize: "0.9375rem", letterSpacing: "0.06em" }}>
        {title}
      </h2>
      {count !== undefined && <span className="themed-muted ps-mono-meta">{count}</span>}
    </div>
  );
}
