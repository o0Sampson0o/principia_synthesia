import { describe, it, expect } from "vitest";
import {
  deriveEras,
  yearMarkerInterval,
  assignEraLabelLanes,
} from "@/lib/timeline-utils";
import type { EventRow, DerivedEra } from "@/lib/timeline-utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Omit<EventRow, "eventDate">> & { eventDate: string }): EventRow {
  return {
    id: 1,
    slug: "event-foo",
    title: "Foo",
    description: null,
    category: null,
    publisherSlug: "publisher-a",
    isEraStart: false,
    isEraEnd: false,
    eraName: null,
    ...overrides,
    eventDate: new Date(overrides.eventDate),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEra(name: string, startYear: number, endYear: number | null = null): DerivedEra {
  return { name, startYear, endYear };
}

// ─── assignEraLabelLanes ──────────────────────────────────────────────────────

describe("assignEraLabelLanes", () => {
  it("returns empty array for empty input", () => {
    expect(assignEraLabelLanes([], 10, 1000)).toEqual([]);
  });

  it("single era is assigned lane 0", () => {
    const result = assignEraLabelLanes([makeEra("Modern Age", 2000)], 10, 1990);
    expect(result).toHaveLength(1);
    expect(result[0].lane).toBe(0);
  });

  it("two eras starting 100 years apart at 10px/yr do not overlap and stay on lane 0", () => {
    const eras = [makeEra("Era A", 1000), makeEra("Era B", 1100)];
    const result = assignEraLabelLanes(eras, 10, 1000, 22);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(0);
  });

  it("two eras starting close together at low pxPerYear get different lanes", () => {
    const eras = [makeEra("Era A", 1000), makeEra("Era B", 1001)];
    const result = assignEraLabelLanes(eras, 10, 1000, 22);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });

  it("three eras all starting in the same window get lanes 0, 1, 2", () => {
    const eras = [
      makeEra("Era A", 1000),
      makeEra("Era B", 1001),
      makeEra("Era C", 1002),
    ];
    const result = assignEraLabelLanes(eras, 10, 1000, 22);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
    expect(result[2].lane).toBe(2);
  });

  it("sorts by startYear ascending regardless of input order", () => {
    const eras = [makeEra("Era B", 1100), makeEra("Era A", 1000)];
    const result = assignEraLabelLanes(eras, 10, 1000, 22);
    expect(result[0].name).toBe("Era A");
    expect(result[1].name).toBe("Era B");
  });

  it("uses canvas-relative coordinates: eras at 2000 and 2001 with minYear=1990 and pxPerYear=30 get different lanes", () => {
    const eras = [makeEra("Era A", 2000), makeEra("Era B", 2001)];
    const result = assignEraLabelLanes(eras, 30, 1990, 22);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });
});

// ─── yearMarkerInterval ───────────────────────────────────────────────────────

describe("yearMarkerInterval", () => {
  it("returns 1 at 200px/yr", () => expect(yearMarkerInterval(200)).toBe(1));
  it("returns 1 above 200px/yr", () => expect(yearMarkerInterval(400)).toBe(1));
  it("returns 10 at 80px/yr", () => expect(yearMarkerInterval(80)).toBe(10));
  it("returns 10 between 80 and 200", () => expect(yearMarkerInterval(199)).toBe(10));
  it("returns 25 at 40px/yr", () => expect(yearMarkerInterval(40)).toBe(25));
  it("returns 25 between 40 and 79", () => expect(yearMarkerInterval(60)).toBe(25));
  it("returns 100 below 40px/yr", () => expect(yearMarkerInterval(39)).toBe(100));
  it("returns 100 at 1px/yr", () => expect(yearMarkerInterval(1)).toBe(100));
});


// ─── deriveEras ───────────────────────────────────────────────────────────────

describe("deriveEras", () => {
  it("returns empty array for empty input", () => {
    expect(deriveEras([])).toEqual([]);
  });

  it("returns open era (endYear null) when only start event present", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "2000-01-01", isEraStart: true, eraName: "Modern Age" }),
    ];
    const eras = deriveEras(rows);
    expect(eras).toHaveLength(1);
    expect(eras[0]).toEqual({ name: "Modern Age", startYear: 2000, endYear: null });
  });

  it("returns closed era when both start and end are present", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "1990-06-01", isEraStart: true, eraName: "Cold War Era" }),
      makeRow({ id: 2, eventDate: "1991-12-25", isEraEnd: true, eraName: "Cold War Era" }),
    ];
    const eras = deriveEras(rows);
    expect(eras).toHaveLength(1);
    expect(eras[0]).toEqual({ name: "Cold War Era", startYear: 1990, endYear: 1991 });
  });

  it("ignores era end events with no matching open era", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "2005-03-01", isEraEnd: true, eraName: "Orphan Era" }),
    ];
    expect(deriveEras(rows)).toHaveLength(0);
  });

  it("handles multiple independent concurrent eras", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "1970-01-01", isEraStart: true, eraName: "Era A" }),
      makeRow({ id: 2, eventDate: "1975-01-01", isEraStart: true, eraName: "Era B" }),
      makeRow({ id: 3, eventDate: "1980-01-01", isEraEnd: true, eraName: "Era A" }),
      makeRow({ id: 4, eventDate: "1985-01-01", isEraEnd: true, eraName: "Era B" }),
    ];
    const eras = deriveEras(rows);
    expect(eras).toHaveLength(2);

    const eraA = eras.find((e) => e.name === "Era A");
    expect(eraA).toEqual({ name: "Era A", startYear: 1970, endYear: 1980 });

    const eraB = eras.find((e) => e.name === "Era B");
    expect(eraB).toEqual({ name: "Era B", startYear: 1975, endYear: 1985 });
  });

  it("sorts by date before processing so order of input rows does not matter", () => {
    const rows = [
      makeRow({ id: 2, eventDate: "2010-01-01", isEraEnd: true, eraName: "Era X" }),
      makeRow({ id: 1, eventDate: "2000-01-01", isEraStart: true, eraName: "Era X" }),
    ];
    const eras = deriveEras(rows);
    expect(eras).toHaveLength(1);
    expect(eras[0]).toEqual({ name: "Era X", startYear: 2000, endYear: 2010 });
  });

  it("does not create an era for a row with isEraStart true but null eraName", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "2000-01-01", isEraStart: true, eraName: null }),
    ];
    expect(deriveEras(rows)).toHaveLength(0);
  });

  it("does not close an era for a row with isEraEnd true but null eraName", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "2000-01-01", isEraStart: true, eraName: "Era Y" }),
      makeRow({ id: 2, eventDate: "2010-01-01", isEraEnd: true, eraName: null }),
    ];
    const eras = deriveEras(rows);
    expect(eras).toHaveLength(1);
    expect(eras[0].endYear).toBeNull();
  });
});
