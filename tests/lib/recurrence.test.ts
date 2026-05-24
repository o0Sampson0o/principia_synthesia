import { describe, it, expect } from "vitest";
import { expandRecurrence, getNextOccurrences, buildRruleString } from "@/lib/recurrence";
import type { EventRow } from "@/lib/timeline-utils";

function makeEvent(overrides: Partial<EventRow & { recurrenceRule?: string | null; recurrenceUntil?: Date | null }> = {}): EventRow & { recurrenceRule?: string | null; recurrenceUntil?: Date | null } {
  return {
    id: 1,
    slug: "event-test",
    title: "Test",
    description: null,
    eventDate: new Date("2024-01-01"),
    category: null,
    publisherSlug: "pub",
    isEraStart: false,
    isEraEnd: false,
    eraName: null,
    recurrenceRule: null,
    recurrenceUntil: null,
    ...overrides,
  };
}

describe("buildRruleString", () => {
  it("returns null for 'none' frequency", () => {
    expect(buildRruleString("none")).toBeNull();
  });

  it("builds a weekly rrule string", () => {
    const rule = buildRruleString("weekly");
    expect(rule).toContain("FREQ=WEEKLY");
  });

  it("builds monthly rrule with count", () => {
    const rule = buildRruleString("monthly", 3);
    expect(rule).toContain("FREQ=MONTHLY");
    expect(rule).toContain("COUNT=3");
  });

  it("builds annual rrule with until date", () => {
    const until = new Date("2026-12-31");
    const rule = buildRruleString("annually", undefined, until);
    expect(rule).toContain("FREQ=YEARLY");
    expect(rule).toContain("UNTIL=");
  });
});

describe("expandRecurrence", () => {
  it("returns empty array for event with no recurrence rule", () => {
    const event = makeEvent({ recurrenceRule: null });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2024-12-31"));
    expect(result).toEqual([]);
  });

  it("expands weekly event over January 2024 returning multiple occurrences", () => {
    const rruleStr = buildRruleString("weekly")!;
    const event = makeEvent({
      eventDate: new Date("2024-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2024-02-01"));
    expect(result.length).toBeGreaterThanOrEqual(4);
    const first = result[0].eventDate;
    const second = result[1].eventDate;
    const diffMs = second.getTime() - first.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns virtual slugs with --date suffix", () => {
    const rruleStr = buildRruleString("weekly")!;
    const event = makeEvent({
      slug: "event-seminar",
      eventDate: new Date("2024-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2024-01-31"));
    for (const r of result) {
      expect(r.slug).toMatch(/^event-seminar--\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("returns unique id and slug for each virtual instance", () => {
    const rruleStr = buildRruleString("weekly")!;
    const event = makeEvent({
      id: 42,
      slug: "event-weekly",
      eventDate: new Date("2024-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2024-01-31"));
    expect(result.length).toBeGreaterThanOrEqual(2);
    const ids = result.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    const slugs = result.map((r) => r.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it("virtual instances have null recurrenceRule so they do not recurse", () => {
    const rruleStr = buildRruleString("weekly")!;
    const event = makeEvent({
      eventDate: new Date("2024-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2024-01-31"));
    for (const r of result) {
      expect(r.recurrenceRule).toBeNull();
    }
  });

  it("respects count=3 — returns exactly 3 instances", () => {
    const rruleStr = buildRruleString("annually", 3)!;
    const event = makeEvent({
      eventDate: new Date("2024-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2030-12-31"));
    expect(result.length).toBe(3);
  });

  it("respects until date — cuts off series after the until date", () => {
    const until = new Date("2024-06-30");
    const rruleStr = buildRruleString("monthly", undefined, until)!;
    const event = makeEvent({
      eventDate: new Date("2024-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2024-01-01"), new Date("2024-12-31"));
    const allBeforeUntil = result.every((r) => r.eventDate <= until);
    expect(allBeforeUntil).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("caps at 366 instances per window", () => {
    const rruleStr = buildRruleString("weekly")!;
    const event = makeEvent({
      eventDate: new Date("2000-01-01"),
      recurrenceRule: rruleStr,
    });
    const result = expandRecurrence(event, new Date("2000-01-01"), new Date("2030-12-31"));
    expect(result.length).toBeLessThanOrEqual(366);
  });
});

describe("getNextOccurrences", () => {
  it("returns empty array for non-recurring event", () => {
    const event = makeEvent({ recurrenceRule: null });
    expect(getNextOccurrences(event, 5)).toEqual([]);
  });

  it("returns up to limit occurrences in the future", () => {
    const rruleStr = buildRruleString("monthly", 12)!;
    const event = makeEvent({
      eventDate: new Date("2020-01-01"),
      recurrenceRule: rruleStr,
    });
    const results = getNextOccurrences(event, 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
