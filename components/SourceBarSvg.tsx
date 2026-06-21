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

export default function SourceBarSvg({ data }: Props) {
  const total = SOURCES.reduce((s, k) => s + data[k], 0);

  if (total === 0) {
    return (
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--muted-foreground)",
          fontFamily: "ui-monospace, monospace",
          padding: "2rem 0",
          textAlign: "center",
        }}
      >
        No data in range
      </p>
    );
  }

  const sorted = [...SOURCES].sort((a, b) => data[b] - data[a]);
  const maxVal = data[sorted[0]];

  return (
    <div style={{ width: "100%" }}>
      {sorted.map((src, i) => {
        const count = data[src];
        const hasData = count > 0;
        const pct = ((count / total) * 100).toFixed(1);
        const barWidth = maxVal > 0 ? (count / maxVal) * 100 : 0;
        const isLast = i === sorted.length - 1;

        return (
          <div
            key={src}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom: isLast ? "none" : "1px solid var(--border)",
              opacity: hasData ? 1 : 0.4,
            }}
          >
            {/* Label */}
            <div
              style={{
                width: "5rem",
                flexShrink: 0,
                textAlign: "right",
                fontSize: "0.8125rem",
                fontFamily: "system-ui, -apple-system, sans-serif",
                color: hasData ? "var(--foreground)" : "var(--muted-foreground)",
                lineHeight: 1,
              }}
            >
              {SOURCE_LABELS[src]}
            </div>

            {/* Bar track */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {hasData && (
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "var(--accent)",
                    opacity: 0.8,
                    transition: "width 0.3s ease",
                  }}
                />
              )}
            </div>

            {/* Percentage */}
            <div
              style={{
                width: "3.5rem",
                flexShrink: 0,
                textAlign: "right",
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                color: "var(--muted-foreground)",
                lineHeight: 1,
              }}
            >
              {hasData ? `${pct}%` : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
