import { describe, it, expect, vi } from "vitest";
import { parseCsv, parseJson, slugifyTitle, fetchWikidata } from "@/lib/event-import";
import { mergeEvents } from "@/lib/event-import-merge";

// ─── slugifyTitle ─────────────────────────────────────────────────────────────

describe("slugifyTitle", () => {
  it("prefixes result with 'event-'", () => {
    expect(slugifyTitle("Cold War")).toMatch(/^event-/);
  });

  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugifyTitle("Moon Landing")).toBe("event-moon-landing");
  });

  it("strips special characters", () => {
    expect(slugifyTitle("The A&B! Event")).toBe("event-the-a-b-event");
  });

  it("handles empty string fallback", () => {
    expect(slugifyTitle("")).toBe("event-untitled");
  });
});

// ─── parseCsv ─────────────────────────────────────────────────────────────────

describe("parseCsv", () => {
  it("returns empty for empty input", () => {
    const result = parseCsv("");
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("parses a valid CSV row", () => {
    const csv = "title,slug,eventDate\nCold War Begins,event-cold-war-begins,1947-03-12";
    const result = parseCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.title).toBe("Cold War Begins");
    expect(result.valid[0].data.slug).toBe("event-cold-war-begins");
    expect(result.errors).toHaveLength(0);
  });

  it("auto-generates slug from title when slug column is empty", () => {
    const csv = "title,slug,eventDate\nMoon Landing,,1969-07-20";
    const result = parseCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.slug).toMatch(/^event-moon-landing/);
  });

  it("reports error for invalid eventDate", () => {
    const csv = "title,slug,eventDate\nBad Event,event-bad,not-a-date";
    const result = parseCsv(csv);
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
  });

  it("handles quoted fields with commas", () => {
    const csv = `title,slug,eventDate,description\n"Event, Large",event-event-large,2000-01-01,"Big deal, yes"`;
    const result = parseCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.title).toBe("Event, Large");
    expect(result.valid[0].data.description).toBe("Big deal, yes");
  });

  it("reports row number for errors (1-indexed, skipping header)", () => {
    const csv = "title,slug,eventDate\nGood,event-good,2000-01-01\nBad,event-bad,not-a-date";
    const result = parseCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
  });

  it("maps isEraStart 'true' to boolean true", () => {
    const csv = "title,slug,eventDate,isEraStart,eraName\nEra Start,event-era,2000-01-01,true,Test Era";
    const result = parseCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.isEraStart).toBe(true);
  });
});

// ─── parseJson ────────────────────────────────────────────────────────────────

describe("parseJson", () => {
  it("returns error for invalid JSON", () => {
    const result = parseJson("not json");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(0);
  });

  it("returns error for non-array JSON", () => {
    const result = parseJson('{"title": "foo"}');
    expect(result.errors).toHaveLength(1);
  });

  it("parses a valid JSON array", () => {
    const input = JSON.stringify([
      { title: "Sputnik", slug: "event-sputnik", eventDate: "1957-10-04" },
    ]);
    const result = parseJson(input);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.title).toBe("Sputnik");
  });

  it("auto-generates slug when absent", () => {
    const input = JSON.stringify([{ title: "Moon Landing", eventDate: "1969-07-20" }]);
    const result = parseJson(input);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.slug).toMatch(/^event-/);
  });

  it("reports row-level errors for invalid objects", () => {
    const input = JSON.stringify([
      { title: "Good", slug: "event-good", eventDate: "2000-01-01" },
      { title: "Bad", slug: "event-bad", eventDate: "not-a-date" },
    ]);
    const result = parseJson(input);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
  });
});

// ─── mergeEvents ─────────────────────────────────────────────────────────────

describe("mergeEvents", () => {
  const ownerType = "user";
  const ownerId = 1;

  it("marks new events as toInsert", () => {
    const parsed = [{ title: "New", slug: "event-new", eventDate: "2000-01-01", isEraStart: false, isEraEnd: false }];
    const result = mergeEvents(parsed as never, [], ownerType, ownerId);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(0);
  });

  it("marks existing events as toUpdate", () => {
    const parsed = [{ title: "Existing", slug: "event-existing", eventDate: "2000-01-01", isEraStart: false, isEraEnd: false }];
    const existing = [{ ownerType, ownerId, slug: "event-existing" }];
    const result = mergeEvents(parsed as never, existing, ownerType, ownerId);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(1);
  });

  it("scopes existing check to ownerType + ownerId", () => {
    const parsed = [{ title: "Event", slug: "event-x", eventDate: "2000-01-01", isEraStart: false, isEraEnd: false }];
    const existing = [{ ownerType: "org", ownerId: 99, slug: "event-x" }];
    const result = mergeEvents(parsed as never, existing, ownerType, ownerId);
    expect(result.toInsert).toHaveLength(1);
  });
});

// ─── fetchWikidata ────────────────────────────────────────────────────────────

describe("fetchWikidata", () => {
  it("returns parsed events from valid SPARQL response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          bindings: [
            {
              item: { value: "http://www.wikidata.org/entity/Q42" },
              itemLabel: { value: "Douglas Adams" },
              date: { value: "1952-03-11" },
              description: { value: "British author" },
            },
          ],
        },
      }),
    });

    const result = await fetchWikidata({
      sparqlQuery: "SELECT * WHERE {}",
      publisherSlug: "test",
      fetchFn: mockFetch as typeof fetch,
    });

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.slug).toBe("event-wd-q42");
    expect(result.valid[0].data.title).toBe("Douglas Adams");
  });

  it("returns error on HTTP failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    const result = await fetchWikidata({
      sparqlQuery: "SELECT * WHERE {}",
      publisherSlug: "test",
      fetchFn: mockFetch as typeof fetch,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("429");
  });

  it("skips rows missing a valid date", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          bindings: [
            {
              item: { value: "http://www.wikidata.org/entity/Q1" },
              itemLabel: { value: "No Date Event" },
            },
          ],
        },
      }),
    });

    const result = await fetchWikidata({
      sparqlQuery: "SELECT * WHERE {}",
      publisherSlug: "test",
      fetchFn: mockFetch as typeof fetch,
    });

    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
