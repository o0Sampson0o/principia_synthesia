import { z } from "zod";
import { createEventSchema } from "./validations";

// ─── Parsed event shape ───────────────────────────────────────────────────────

export type ParsedEvent = z.infer<typeof createEventSchema>;

export interface ParsedRow<T> {
  row: number;
  data: T;
}

export interface ParseError {
  row: number;
  message: string;
}

export interface ParseResult {
  valid: ParsedRow<ParsedEvent>[];
  errors: ParseError[];
}

// ─── Slug generation ──────────────────────────────────────────────────────────

export function slugifyTitle(title: string): string {
  const slugPart = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
  return "event-" + slugPart;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

const EXPECTED_HEADERS = [
  "title",
  "slug",
  "eventDate",
  "description",
  "category",
  "eraName",
  "isEraStart",
  "isEraEnd",
] as const;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(content: string): ParseResult {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { valid: [], errors: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const valid: ParsedRow<ParsedEvent>[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const values = parseCsvLine(lines[i]);

    const obj: Record<string, string> = {};
    for (const header of EXPECTED_HEADERS) {
      const idx = headers.indexOf(header.toLowerCase());
      obj[header] = idx >= 0 ? (values[idx] ?? "").trim() : "";
    }

    if (!obj.slug && obj.title) {
      obj.slug = slugifyTitle(obj.title);
    }

    const result = createEventSchema.safeParse({
      ...obj,
      isEraStart: obj.isEraStart === "true" || obj.isEraStart === "1" || obj.isEraStart === "yes" ? "on" : undefined,
      isEraEnd: obj.isEraEnd === "true" || obj.isEraEnd === "1" || obj.isEraEnd === "yes" ? "on" : undefined,
    });

    if (result.success) {
      valid.push({ row: rowNum, data: result.data });
    } else {
      errors.push({
        row: rowNum,
        message: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  return { valid, errors };
}

// ─── JSON parser ──────────────────────────────────────────────────────────────

const jsonInputSchema = z.array(z.record(z.unknown())).max(5000);

export function parseJson(content: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      valid: [],
      errors: [{ row: 0, message: "Invalid JSON: could not parse file" }],
    };
  }

  const arrayResult = jsonInputSchema.safeParse(parsed);
  if (!arrayResult.success) {
    return {
      valid: [],
      errors: [{ row: 0, message: "Expected a JSON array of event objects (max 5000)" }],
    };
  }

  const valid: ParsedRow<ParsedEvent>[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < arrayResult.data.length; i++) {
    const rowNum = i + 1;
    const obj = arrayResult.data[i] as Record<string, unknown>;

    if (!obj.slug && typeof obj.title === "string") {
      obj.slug = slugifyTitle(obj.title);
    }

    const result = createEventSchema.safeParse(obj);
    if (result.success) {
      valid.push({ row: rowNum, data: result.data });
    } else {
      errors.push({
        row: rowNum,
        message: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  return { valid, errors };
}

// ─── Wikidata SPARQL fetcher ──────────────────────────────────────────────────

export interface WikidataFetchOptions {
  sparqlQuery: string;
  publisherSlug: string;
  fetchFn?: typeof fetch;
}

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

const wikidataRowSchema = z.object({
  item: z.object({ value: z.string() }),
  itemLabel: z.object({ value: z.string() }),
  date: z.object({ value: z.string() }).optional(),
  description: z.object({ value: z.string() }).optional(),
});

export async function fetchWikidata(opts: WikidataFetchOptions): Promise<ParseResult> {
  const { sparqlQuery, fetchFn = fetch } = opts;

  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparqlQuery)}&format=json`;

  let json: unknown;
  try {
    const resp = await fetchFn(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "PrincipiaSynthesia/1.0 (https://principia-synthesia.app)",
      },
    });
    if (!resp.ok) {
      return {
        valid: [],
        errors: [{ row: 0, message: `Wikidata returned HTTP ${resp.status}` }],
      };
    }
    json = await resp.json();
  } catch (err) {
    return {
      valid: [],
      errors: [{ row: 0, message: `Failed to fetch Wikidata: ${String(err)}` }],
    };
  }

  const bindings = (json as { results?: { bindings?: unknown[] } })?.results?.bindings ?? [];
  const valid: ParsedRow<ParsedEvent>[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < bindings.length; i++) {
    const rowNum = i + 1;
    const rowResult = wikidataRowSchema.safeParse(bindings[i]);
    if (!rowResult.success) {
      errors.push({ row: rowNum, message: "Unexpected SPARQL row shape" });
      continue;
    }

    const row = rowResult.data;
    const qId = row.item.value.split("/").pop() ?? "";
    const slug = `event-wd-${qId.toLowerCase()}`;
    const title = row.itemLabel.value;
    const description = row.description?.value ?? undefined;
    const rawDate = row.date?.value;

    if (!rawDate || Number.isNaN(Date.parse(rawDate))) {
      errors.push({ row: rowNum, message: `Missing or invalid date for ${title}` });
      continue;
    }

    const result = createEventSchema.safeParse({ slug, title, description, eventDate: rawDate });
    if (result.success) {
      valid.push({ row: rowNum, data: result.data });
    } else {
      errors.push({
        row: rowNum,
        message: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  return { valid, errors };
}
