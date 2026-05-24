import { RRule, Frequency } from "rrule";
import type { EventRow } from "@/lib/timeline-utils";

const MAX_INSTANCES_PER_WINDOW = 366;

export type RecurrenceFrequency = "none" | "weekly" | "monthly" | "annually";

export function buildRruleString(
  frequency: RecurrenceFrequency,
  count?: number,
  until?: Date
): string | null {
  if (frequency === "none") return null;

  const freqMap: Record<Exclude<RecurrenceFrequency, "none">, Frequency> = {
    weekly: Frequency.WEEKLY,
    monthly: Frequency.MONTHLY,
    annually: Frequency.YEARLY,
  };

  const options: ConstructorParameters<typeof RRule>[0] = {
    freq: freqMap[frequency as Exclude<RecurrenceFrequency, "none">],
  };

  if (count && count > 0 && count <= 100) {
    options.count = count;
  } else if (until) {
    options.until = until;
  }

  return new RRule(options).toString();
}

export function expandRecurrence(
  event: EventRow & { recurrenceRule?: string | null; recurrenceUntil?: Date | null },
  from: Date,
  to: Date
): EventRow[] {
  if (!event.recurrenceRule) return [];

  const baseDate = new Date(event.eventDate);
  let rule: RRule;
  try {
    const parsed = RRule.fromString(event.recurrenceRule);
    rule = new RRule({
      ...parsed.options,
      dtstart: baseDate,
    });
  } catch {
    return [];
  }

  const effectiveTo = event.recurrenceUntil
    ? new Date(Math.min(to.getTime(), new Date(event.recurrenceUntil).getTime()))
    : to;

  const dates = rule.between(from, effectiveTo, true);
  const capped = dates.slice(0, MAX_INSTANCES_PER_WINDOW);

  return capped.map((date) => {
    const isoDate = date.toISOString().split("T")[0];
    return {
      ...event,
      id: `${event.id}-${isoDate}`,
      slug: `${event.slug}--${isoDate}`,
      eventDate: date,
      recurrenceRule: null,
    };
  });
}

export function getNextOccurrences(
  event: EventRow & { recurrenceRule?: string | null; recurrenceUntil?: Date | null },
  limit = 5
): Date[] {
  if (!event.recurrenceRule) return [];

  const baseDate = new Date(event.eventDate);
  const now = new Date();
  let rule: RRule;
  try {
    const parsed = RRule.fromString(event.recurrenceRule);
    rule = new RRule({
      ...parsed.options,
      dtstart: baseDate,
    });
  } catch {
    return [];
  }

  const futureStart = now > baseDate ? now : baseDate;
  const dates = rule.after(futureStart, true);
  if (!dates) return [];

  const results: Date[] = [];
  let cursor = dates;
  while (results.length < limit) {
    if (!cursor) break;
    if (!event.recurrenceUntil || cursor <= new Date(event.recurrenceUntil)) {
      results.push(cursor);
    }
    cursor = rule.after(cursor, false)!;
    if (!cursor) break;
  }
  return results;
}

export function describeRecurrence(rruleString: string): string {
  try {
    const rule = RRule.fromString(rruleString);
    return rule.toText();
  } catch {
    return "repeating";
  }
}
