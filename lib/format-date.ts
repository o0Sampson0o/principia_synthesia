/**
 * The one date format for reader-facing surfaces: "Jul 17, 2026".
 * Every component renders dates through this — two month styles on one
 * page reads as two designers.
 */
export function formatDate(d: Date | string | number): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
