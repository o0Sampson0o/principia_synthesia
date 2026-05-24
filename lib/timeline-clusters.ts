import { toFractionalYear } from "@/lib/timeline-utils";
import type { EventRow } from "@/lib/timeline-utils";

export type Cluster = {
  id: string;
  events: EventRow[];
  year: number;
  eraName: string | null;
  topPx: number;
};

export function clusterEvents(
  rows: EventRow[],
  pxPerYear: number,
  threshold = 8
): Cluster[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );

  const minFractYear = toFractionalYear(new Date(sorted[0].eventDate));

  const withPx = sorted.map((row) => ({
    row,
    topPx: (toFractionalYear(new Date(row.eventDate)) - minFractYear) * pxPerYear,
  }));

  const clusters: Cluster[] = [];

  for (const { row, topPx } of withPx) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      topPx - last.topPx < threshold &&
      last.eraName === row.eraName
    ) {
      last.events.push(row);
    } else {
      clusters.push({
        id: `cluster-${row.id}`,
        events: [row],
        year: new Date(row.eventDate).getFullYear(),
        eraName: row.eraName ?? null,
        topPx,
      });
    }
  }

  return clusters;
}

export function clusteringThreshold(pxPerYear: number): number {
  if (pxPerYear >= 30) return 0;
  return 8 * (1 - pxPerYear / 30);
}
