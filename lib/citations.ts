// Pure citation formatters — no DB or server dependencies.
// All functions are deterministic given their inputs.

export type CitationInput = {
  authorDisplayName: string;
  authorPublisherSlug: string;
  title: string;
  publishedAt: Date;       // updatedAt of live article OR snapshot.publishedAt
  url: string;             // full canonical URL incl ?v=… when snapshot
  versionHash: string | null;
  accessedAt: Date;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDate(d: Date): string {
  // DD Mon YYYY
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function longDate(d: Date): string {
  // Month DD, YYYY
  const month = MONTHS_LONG[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

function year(d: Date): string {
  return d.getUTCFullYear().toString();
}

/** Derive an author surname guess: last word of displayName, slugified. */
function authorLastNameSlug(displayName: string): string {
  const words = displayName.trim().split(/\s+/);
  return (words[words.length - 1] ?? displayName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** First word of article slug after the `article-` prefix. */
function firstSlugWord(url: string): string {
  const match = url.match(/article-([a-z0-9]+)/);
  return match?.[1] ?? "unknown";
}

function bibtexKey(input: CitationInput): string {
  const last = authorLastNameSlug(input.authorDisplayName) || input.authorPublisherSlug;
  const word = firstSlugWord(input.url);
  const yr = year(input.publishedAt);
  return `${last}${word}${yr}`;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * APA 7th edition
 * Author, A. (YYYY). Title. Principia Synthesia. URL [version, accessed]
 */
export function formatAPA(input: CitationInput): string {
  const { authorDisplayName, title, publishedAt, url, versionHash, accessedAt } = input;
  const parts = [
    `${authorDisplayName}. (${year(publishedAt)}). ${title}. Principia Synthesia. ${url}`,
  ];
  const annotations: string[] = [];
  if (versionHash) annotations.push(`version ${versionHash}`);
  annotations.push(`accessed ${isoDate(accessedAt)}`);
  parts.push(`(${annotations.join(", ")})`);
  return parts.join(" ");
}

/**
 * MLA 9th edition
 * Author. "Title." Principia Synthesia, DD Mon YYYY, URL. Accessed DD Mon YYYY.
 */
export function formatMLA(input: CitationInput): string {
  const { authorDisplayName, title, publishedAt, url, accessedAt } = input;
  return `${authorDisplayName}. "${title}." *Principia Synthesia*, ${shortDate(publishedAt)}, ${url}. Accessed ${shortDate(accessedAt)}.`;
}

/**
 * Chicago 17th edition (notes-bibliography)
 * Author. "Title." Principia Synthesia. Modified DD Mon YYYY. URL
 */
export function formatChicago(input: CitationInput): string {
  const { authorDisplayName, title, publishedAt, url } = input;
  return `${authorDisplayName}. "${title}." Principia Synthesia. Modified ${longDate(publishedAt)}. ${url}`;
}

/**
 * BibTeX @misc entry
 */
export function formatBibTeX(input: CitationInput): string {
  const key = bibtexKey(input);
  const yr = year(input.publishedAt);
  const { authorDisplayName, title, url, versionHash, accessedAt } = input;
  const lines = [
    `@misc{${key},`,
    `  author    = {${authorDisplayName}},`,
    `  title     = {{${title}}},`,
    `  year      = {${yr}},`,
    `  url       = {${url}},`,
    `  note      = {Accessed ${isoDate(accessedAt)}},`,
    `  urldate   = {${isoDate(accessedAt)}},`,
  ];
  if (versionHash) {
    lines.push(`  version   = {${versionHash}},`);
  }
  lines.push("}");
  return lines.join("\n");
}
