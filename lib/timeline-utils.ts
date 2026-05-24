export type EventRow = {
  id: number | string;
  slug: string;
  title: string;
  description: string | null;
  eventDate: Date;
  category: string | null;
  publisherSlug: string | null;
  isEraStart: boolean;
  isEraEnd: boolean;
  eraName: string | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: Date | null;
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

export type DerivedEraWithLane = DerivedEra & { lane: number };

export function assignEraLabelLanes(
  eras: DerivedEra[],
  pxPerYear: number,
  minYear: number,
  labelHeightPx = 22,
): DerivedEraWithLane[] {
  const MAX_LANES = 3;
  const sorted = [...eras].sort((a, b) => a.startYear - b.startYear);
  const lastBottomPx: number[] = [];
  return sorted.map((era) => {
    const startPx = (era.startYear - minYear) * pxPerYear;
    let lane = lastBottomPx.findIndex(
      (bottom) => bottom + labelHeightPx <= startPx,
    );
    if (lane === -1) {
      lane = lastBottomPx.length < MAX_LANES ? lastBottomPx.length : 0;
    }
    lastBottomPx[lane] = startPx + labelHeightPx;
    return { ...era, lane };
  });
}

export function eraToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type TimelineSearch = {
  q: string | undefined;
  era: string | undefined;
  category: string | undefined;
  publisher: string | undefined;
  from: string | undefined;
  to: string | undefined;
  page: number;
};

export function parseTimelineSearch(params: URLSearchParams): TimelineSearch {
  const rawQ = params.get("q")?.trim();
  const q = rawQ ? rawQ.slice(0, 200) : undefined;

  const rawEra = params.get("era")?.trim();
  const era = rawEra || undefined;

  const category = params.get("category")?.trim() || undefined;
  const publisher = params.get("publisher")?.trim() || undefined;

  const rawFrom = params.get("from")?.trim() ?? "";
  const from = rawFrom && !Number.isNaN(Date.parse(rawFrom)) ? rawFrom : undefined;

  const rawTo = params.get("to")?.trim() ?? "";
  const to = rawTo && !Number.isNaN(Date.parse(rawTo)) ? rawTo : undefined;

  const rawPage = params.get("page");
  const parsedPage = parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;

  return { q, era, category, publisher, from, to, page };
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
