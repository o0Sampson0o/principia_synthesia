import type { ParsedEvent } from "./event-import";

export interface ExistingEvent {
  ownerType: string;
  ownerId: number;
  slug: string;
}

export interface MergeResult {
  toInsert: ParsedEvent[];
  toUpdate: ParsedEvent[];
  toSkip: ParsedEvent[];
}

export function mergeEvents(
  parsed: ParsedEvent[],
  existing: ExistingEvent[],
  ownerType: string,
  ownerId: number
): MergeResult {
  const existingSlugs = new Set(
    existing
      .filter((e) => e.ownerType === ownerType && e.ownerId === ownerId)
      .map((e) => e.slug)
  );

  const toInsert: ParsedEvent[] = [];
  const toUpdate: ParsedEvent[] = [];

  for (const event of parsed) {
    if (existingSlugs.has(event.slug)) {
      toUpdate.push(event);
    } else {
      toInsert.push(event);
    }
  }

  return { toInsert, toUpdate, toSkip: [] };
}
