import type { EventRow } from "@/lib/timeline-utils";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function renderTimelineHtml(
  rows: EventRow[],
  opts: { includeHeading?: boolean } = { includeHeading: true }
): string {
  if (rows.length === 0) return "";

  const sorted = [...rows].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );

  const byYear = new Map<number, EventRow[]>();
  for (const row of sorted) {
    const year = new Date(row.eventDate).getFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(row);
  }

  const yearSections = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, events]) => {
      const items = events
        .map((e) => {
          const dateStr = formatDate(e.eventDate);
          const desc = e.description
            ? `<p>${escapeHtml(e.description)}</p>`
            : "";
          const category = e.category
            ? ` <span class="timeline-category">${escapeHtml(e.category)}</span>`
            : "";
          return `<li>
            <time datetime="${new Date(e.eventDate).toISOString().slice(0, 10)}">${escapeHtml(dateStr)}</time> —
            <strong>${escapeHtml(e.title)}</strong>${category}
            ${desc}
          </li>`;
        })
        .join("\n");
      return `<h2>${year}</h2>\n<ol>${items}</ol>`;
    })
    .join("\n");

  if (!opts.includeHeading) {
    return `<section>${yearSections}</section>`;
  }

  return `<section aria-labelledby="timeline-heading">
  <h1 id="timeline-heading">Timeline</h1>
  ${yearSections}
</section>`;
}
