export type EventRow = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
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

export function toFractionalYear(date: Date): number {
  const y = date.getFullYear()
  const startOfYear = new Date(y, 0, 1).getTime()
  const msInYear = new Date(y + 1, 0, 1).getTime() - startOfYear
  return y + (date.getTime() - startOfYear) / msInYear
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
