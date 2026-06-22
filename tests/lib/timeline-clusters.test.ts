import { describe, it, expect } from "vitest";
import { clusterEvents, clusteringThreshold } from "@/lib/timeline-clusters";
import type { EventRow } from "@/lib/timeline-utils";

function makeRow(overrides: Omit<Partial<EventRow>, "eventDate"> & { eventDate: string }): EventRow {
  const { eventDate, ...rest } = overrides;
  return {
    id: Math.floor(Math.random() * 10000),
    slug: `event-${eventDate}`,
    title: "Event",
    description: null,
    category: null,
    publisherSlug: "pub",
    isEraStart: false,
    isEraEnd: false,
    eraName: null,
    ...rest,
    eventDate: new Date(eventDate),
  };
}

describe("clusterEvents", () => {
  it("returns empty for empty input", () => {
    expect(clusterEvents([], 30)).toEqual([]);
  });

  it("single event produces a single cluster of size 1", () => {
    const row = makeRow({ eventDate: "2024-01-01" });
    const result = clusterEvents([row], 30, 8);
    expect(result.length).toBe(1);
    expect(result[0].events.length).toBe(1);
    expect(result[0].events[0]).toBe(row);
  });

  it("events spread far apart do not cluster", () => {
    const rows = [
      makeRow({ eventDate: "2000-01-01", id: 1 }),
      makeRow({ eventDate: "2010-01-01", id: 2 }),
      makeRow({ eventDate: "2020-01-01", id: 3 }),
    ];
    const result = clusterEvents(rows, 30, 8);
    expect(result.length).toBe(3);
  });

  it("events in the same year cluster at low pxPerYear", () => {
    const rows = [
      makeRow({ eventDate: "2024-01-01", id: 10 }),
      makeRow({ eventDate: "2024-02-01", id: 11 }),
      makeRow({ eventDate: "2024-03-01", id: 12 }),
    ];
    const result = clusterEvents(rows, 5, 8);
    expect(result.length).toBeLessThan(3);
    const totalEvents = result.reduce((sum, c) => sum + c.events.length, 0);
    expect(totalEvents).toBe(3);
  });

  it("events in same time window do NOT cluster across era boundaries", () => {
    const rows = [
      makeRow({ eventDate: "2024-01-01", id: 20, eraName: "EraA" }),
      makeRow({ eventDate: "2024-01-02", id: 21, eraName: "EraB" }),
    ];
    const result = clusterEvents(rows, 5, 100);
    expect(result.length).toBe(2);
  });

  it("events in same era cluster when within threshold", () => {
    const rows = [
      makeRow({ eventDate: "2024-01-01", id: 30, eraName: "EraA" }),
      makeRow({ eventDate: "2024-01-05", id: 31, eraName: "EraA" }),
    ];
    const result = clusterEvents(rows, 5, 100);
    expect(result.length).toBe(1);
    expect(result[0].events.length).toBe(2);
  });

  it("preserves all rows across all clusters", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ eventDate: `2024-0${Math.floor(i / 3) + 1}-${String(i % 28 + 1).padStart(2, "0")}`, id: i + 100 })
    );
    const result = clusterEvents(rows, 20, 8);
    const total = result.reduce((sum, c) => sum + c.events.length, 0);
    expect(total).toBe(10);
  });
});

describe("clusteringThreshold", () => {
  it("returns 0 at pxPerYear >= 30 (no clustering needed)", () => {
    expect(clusteringThreshold(30)).toBe(0);
    expect(clusteringThreshold(80)).toBe(0);
  });

  it("returns a positive value below pxPerYear 30", () => {
    expect(clusteringThreshold(10)).toBeGreaterThan(0);
    expect(clusteringThreshold(10)).toBeLessThanOrEqual(8);
  });

  it("is larger at smaller zoom levels", () => {
    expect(clusteringThreshold(5)).toBeGreaterThan(clusteringThreshold(20));
  });
});
