import type { DailyViewRow } from "@/lib/analytics-queries";

interface Props {
  data: DailyViewRow[];
  width?: number;
  height?: number;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    // Horizontal control points — smooth without vertical overshoot
    const cpx = ((p0.x + p1.x) / 2).toFixed(2);
    d += ` C ${cpx},${p0.y.toFixed(2)} ${cpx},${p1.y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  }
  return d;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export default function SparklineSvg({ data, width = 560, height = 160 }: Props) {
  const VW = width;
  const VH = height;

  // Padding: left for y-labels, bottom for date labels
  const padL = 36;
  const padR = 10;
  const padT = 22; // room for peak callout above line
  const padB = 28; // room for date labels
  const chartW = VW - padL - padR;
  const chartH = VH - padT - padB;

  const emptyLabel = (msg: string) => (
    <svg
      width="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      aria-label={msg}
      style={{ display: "block" }}
    >
      <text
        x={VW / 2}
        y={VH / 2 + 4}
        textAnchor="middle"
        fontSize={11}
        style={{ fill: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}
      >
        {msg}
      </text>
    </svg>
  );

  if (data.length === 0) return emptyLabel("No data in range");

  const maxViews = Math.max(...data.map((d) => d.views), 1);
  const n = data.length;

  const pts = data.map((d, i) => ({
    x: padL + (i / Math.max(n - 1, 1)) * chartW,
    y: padT + (1 - d.views / maxViews) * chartH,
  }));

  const linePath = smoothPath(pts);
  const areaPath =
    linePath +
    ` L ${(padL + chartW).toFixed(2)},${(padT + chartH).toFixed(2)}` +
    ` L ${padL.toFixed(2)},${(padT + chartH).toFixed(2)} Z`;

  // Peak point
  const peakIdx = data.reduce((mi, d, i) => (d.views > data[mi].views ? i : mi), 0);
  const peak = pts[peakIdx];
  const peakVal = data[peakIdx].views;

  // Grid lines at 1/3 and 2/3 of max — subtle dashed rules
  const gridLevels: number[] = n > 1 ? [1 / 3, 2 / 3] : [];

  // Date labels: first, every 7th, last — deduplicated
  const labelIdxSet = new Set<number>([0, n - 1]);
  for (let i = 7; i < n - 1; i += 7) labelIdxSet.add(i);
  const labelIdxs = Array.from(labelIdxSet).sort((a, b) => a - b);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      aria-label="Daily views chart"
      role="img"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="spark-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.13} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLevels.map((t) => {
        const gy = (padT + t * chartH).toFixed(2);
        const gval = Math.round(maxViews * (1 - t));
        return (
          <g key={t}>
            <line
              x1={padL} y1={gy}
              x2={padL + chartW} y2={gy}
              stroke="var(--border)"
              strokeOpacity={0.45}
              strokeDasharray="2 6"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={Number(gy) + 4}
              textAnchor="end"
              fontSize={9.5}
              style={{ fill: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}
            >
              {fmtCount(gval)}
            </text>
          </g>
        );
      })}

      {/* Max y-label (top) */}
      <text
        x={padL - 6}
        y={padT + 4}
        textAnchor="end"
        fontSize={9.5}
        style={{ fill: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}
      >
        {fmtCount(maxViews)}
      </text>

      {/* Zero baseline */}
      <line
        x1={padL} y1={padT + chartH}
        x2={padL + chartW} y2={padT + chartH}
        stroke="var(--border)"
        strokeOpacity={0.5}
        strokeWidth={1}
      />

      {/* Area fill */}
      <path d={areaPath} fill="url(#spark-area-fill)" />

      {/* Data line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Peak marker + callout */}
      {peakVal > 0 && (
        <>
          <circle
            cx={peak.x.toFixed(2)}
            cy={peak.y.toFixed(2)}
            r={3}
            style={{ fill: "var(--accent)" }}
          />
          <text
            x={peak.x.toFixed(2)}
            y={(peak.y - 8).toFixed(2)}
            textAnchor={
              peakIdx < n * 0.15 ? "start"
              : peakIdx > n * 0.85 ? "end"
              : "middle"
            }
            fontSize={9.5}
            fontWeight={500}
            style={{ fill: "var(--accent)", fontFamily: "ui-monospace, monospace" }}
          >
            {peakVal.toLocaleString()}
          </text>
        </>
      )}

      {/* X-axis date labels */}
      {labelIdxs.map((i) => {
        const lx = (padL + (i / Math.max(n - 1, 1)) * chartW).toFixed(2);
        const anchor =
          i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        return (
          <text
            key={i}
            x={lx}
            y={padT + chartH + 17}
            textAnchor={anchor}
            fontSize={9.5}
            style={{ fill: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}
          >
            {data[i].day.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}
