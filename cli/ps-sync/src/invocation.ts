import { basename } from "node:path";

/**
 * How the user actually invokes this CLI, for self-referencing hint messages.
 * Downloaded single-file build → "node ps-sync.mjs"; installed bin → "ps-sync".
 */
export function cliCommand(): string {
  const entry = process.argv[1] ? basename(process.argv[1]) : "";
  if (entry.endsWith(".mjs") || entry.endsWith(".ts") || entry.endsWith(".js")) {
    return `node ${entry}`;
  }
  return "ps-sync";
}
