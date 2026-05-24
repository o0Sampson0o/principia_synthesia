import { describe, it, expect } from "vitest";
import { renderTimelineHtml } from "@/lib/events-html";
import type { EventRow } from "@/lib/timeline-utils";

function makeRow(overrides: Partial<EventRow> & { eventDate: string }): EventRow {
  return {
    id: 1,
    slug: "event-foo",
    title: "Foo",
    description: null,
    category: null,
    publisherSlug: null,
    isEraStart: false,
    isEraEnd: false,
    eraName: null,
    ...overrides,
    eventDate: new Date(overrides.eventDate),
  };
}

describe("renderTimelineHtml", () => {
  it("returns empty string for empty input", () => {
    expect(renderTimelineHtml([])).toBe("");
  });

  it("wraps output in a section with aria-labelledby", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "Millennium" })];
    const html = renderTimelineHtml(rows);
    expect(html).toContain('aria-labelledby="timeline-heading"');
    expect(html).toContain('<h1 id="timeline-heading">Timeline</h1>');
  });

  it("omits the h1 heading when includeHeading is false", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "Millennium" })];
    const html = renderTimelineHtml(rows, { includeHeading: false });
    expect(html).not.toContain('<h1');
    expect(html).toContain("<section>");
    expect(html).toContain("Millennium");
  });

  it("includes exactly one h1 heading by default", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "Millennium" })];
    const html = renderTimelineHtml(rows);
    const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
  });

  it("renders event title in a strong element", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "Millennium" })];
    const html = renderTimelineHtml(rows);
    expect(html).toContain("<strong>Millennium</strong>");
  });

  it("renders event description when present", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "Event", description: "A great event" })];
    const html = renderTimelineHtml(rows);
    expect(html).toContain("A great event");
  });

  it("groups events by year under h2 headings", () => {
    const rows = [
      makeRow({ id: 1, eventDate: "1990-01-01", title: "Nineties Start" }),
      makeRow({ id: 2, eventDate: "1991-06-01", title: "Gulf War" }),
      makeRow({ id: 3, eventDate: "2000-01-01", title: "Millennium" }),
    ];
    const html = renderTimelineHtml(rows);
    expect(html).toContain("<h2>1990</h2>");
    expect(html).toContain("<h2>1991</h2>");
    expect(html).toContain("<h2>2000</h2>");
  });

  it("renders events in chronological order", () => {
    const rows = [
      makeRow({ id: 2, eventDate: "2010-06-01", title: "Later" }),
      makeRow({ id: 1, eventDate: "1950-01-01", title: "Earlier" }),
    ];
    const html = renderTimelineHtml(rows);
    const earlierPos = html.indexOf("Earlier");
    const laterPos = html.indexOf("Later");
    expect(earlierPos).toBeLessThan(laterPos);
  });

  it("includes a time element with iso datetime attribute", () => {
    const rows = [makeRow({ eventDate: "1969-07-20", title: "Moon Landing" })];
    const html = renderTimelineHtml(rows);
    expect(html).toContain('datetime="1969-07-20"');
  });

  it("renders category when present", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "Event", category: "science" })];
    const html = renderTimelineHtml(rows);
    expect(html).toContain("science");
  });

  it("escapes HTML special characters in title", () => {
    const rows = [makeRow({ eventDate: "2000-01-01", title: "A & B <C>" })];
    const html = renderTimelineHtml(rows);
    expect(html).toContain("A &amp; B &lt;C&gt;");
    expect(html).not.toContain("A & B <C>");
  });
});
