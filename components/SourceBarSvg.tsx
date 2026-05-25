import type { ReferrerSource } from "@/lib/analytics-source";

interface Props {
  data: Record<ReferrerSource, number>;
  width?: number;
  height?: number;
}

const SOURCE_LABELS: Record<ReferrerSource, string> = {
  direct: "Direct",
  search: "Search",
  social: "Social",
  internal: "Internal",
  external: "External",
};

const SOURCES: ReferrerSource[] = ["direct", "search", "social", "internal", "external"];

/**
 * A simple inline-SVG horizontal bar chart for referrer-source breakdown.
 * Rendered server-side — no client JS, no chart library.
 */
export default function SourceBarSvg({ data, width = 400, height = 160 }: Props) {
  const total = SOURCES.reduce((s, k) => s + data[k], 0);
  const maxVal = Math.max(...SOURCES.map((k) => data[k]), 1);

  const padLeft = 72; // label column width
  const padRight = 12;
  const padTop = 10;
  const rowH = (height - padTop) / SOURCES.length;
  const barMaxW = width - padLeft - padRight;

  if (total === 0) {
    return (
      <svg width={width} height={height} aria-label="No source data">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.5}>
          No data in range
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Traffic source breakdown"
      role="img"
    >
      {SOURCES.map((src, i) => {
        const y = padTop + i * rowH;
        const barW = (data[src] / maxVal) * barMaxW;
        const pct = total > 0 ? ((data[src] / total) * 100).toFixed(1) : "0.0";

        return (
          <g key={src}>
            {/* Label */}
            <text
              x={padLeft - 6}
              y={y + rowH / 2 + 4}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
            >
              {SOURCE_LABELS[src]}
            </text>
            {/* Bar background */}
            <rect
              x={padLeft}
              y={y + 4}
              width={barMaxW}
              height={rowH - 8}
              rx={3}
              fill="currentColor"
              opacity={0.08}
            />
            {/* Bar fill */}
            {barW > 0 && (
              <rect
                x={padLeft}
                y={y + 4}
                width={barW.toFixed(1)}
                height={rowH - 8}
                rx={3}
                fill="currentColor"
                opacity={0.5}
              />
            )}
            {/* Value label */}
            <text
              x={padLeft + barMaxW + 4}
              y={y + rowH / 2 + 4}
              fontSize={10}
              fill="currentColor"
              opacity={0.7}
            >
              {data[src]} ({pct}%)
            </text>
          </g>
        );
      })}
    </svg>
  );
}
