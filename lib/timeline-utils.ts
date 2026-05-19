export type EventRow = {
  id: number;
  slug: string;
  title: string;
  eventDate: Date;
  category: string | null;
  publisherSlug: string | null;
  isEraStart: boolean;
  isEraEnd: boolean;
  eraName: string | null;
};

export type DerivedEra = {
  name: string;
  startYear: number;
  endYear: number | null;
};

export const DOT_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
] as const;

export function categoryColor(cat: string | null): string {
  if (!cat) return "var(--muted-foreground)";
  let hash = 5381;
  for (let i = 0; i < cat.length; i++) {
    hash = ((hash << 5) + hash) ^ cat.charCodeAt(i);
  }
  return DOT_COLORS[Math.abs(hash) % DOT_COLORS.length];
}

export function yearMarkerInterval(pxPerYear: number): number {
  if (pxPerYear >= 200) return 1;
  if (pxPerYear >= 80) return 10;
  if (pxPerYear >= 40) return 25;
  return 100;
}

export function deriveEras(rows: EventRow[]): DerivedEra[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );
  const openEras = new Map<string, { startYear: number }>();
  const closed: DerivedEra[] = [];

  for (const row of sorted) {
    const year = new Date(row.eventDate).getFullYear();
    if (row.isEraStart && row.eraName) {
      openEras.set(row.eraName, { startYear: year });
    }
    if (row.isEraEnd && row.eraName && openEras.has(row.eraName)) {
      const entry = openEras.get(row.eraName)!;
      closed.push({ name: row.eraName, startYear: entry.startYear, endYear: year });
      openEras.delete(row.eraName);
    }
  }
  for (const [name, { startYear }] of openEras) {
    closed.push({ name, startYear, endYear: null });
  }
  return closed;
}
