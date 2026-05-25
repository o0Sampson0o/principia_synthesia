import type { DailyViewRow } from "@/lib/analytics-queries";

interface Props {
  data: DailyViewRow[];
  width?: number;
  height?: number;
}

/**
 * A simple inline-SVG line chart (sparkline) for daily view counts.
 * Rendered server-side — no client JS, no chart library.
 */
export default function SparklineSvg({ data, width = 480, height = 120 }: Props) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} aria-label="No data">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.5}>
          No data in range
        </text>
      </svg>
    );
  }

  const maxViews = Math.max(...data.map((d) => d.views), 1);
  const padX = 10;
  const padY = 10;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = data.map((d, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padY + (1 - d.views / maxViews) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = points.join(" ");

  // Fill polygon: close down to the bottom-right and bottom-left
  const firstX = padX.toFixed(1);
  const lastX = (padX + chartW).toFixed(1);
  const bottomY = (padY + chartH).toFixed(1);
  const fillPath = `${polyline} ${lastX},${bottomY} ${firstX},${bottomY}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Daily views chart"
      role="img"
    >
      {/* Fill area under line */}
      <polygon points={fillPath} fill="currentColor" opacity={0.1} />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* X-axis labels: first, middle, last */}
      {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((idx) => {
        if (data[idx] === undefined) return null;
        const x = padX + (idx / Math.max(data.length - 1, 1)) * chartW;
        return (
          <text
            key={idx}
            x={x.toFixed(1)}
            y={height - 2}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            opacity={0.6}
          >
            {data[idx].day.slice(5)} {/* MM-DD */}
          </text>
        );
      })}
    </svg>
  );
}
