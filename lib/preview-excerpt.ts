import katex from "katex";
import { wikilinkRe, buildWikilink } from "@/lib/wikilink-syntax";

/**
 * The opening of an article as a link-preview excerpt: the first real prose
 * paragraph of its markdown body (frontmatter already stripped), with markup
 * reduced to plain text and inline `$…$` maths kept so it can be typeset.
 *
 * Headings, code, display maths, tables, quotes/callouts, lists and MDX tags
 * are skipped — a preview should read like the article's first sentence, not
 * its scaffolding. Pure; exported for tests.
 */
export function firstParagraph(body: string, max = 280): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const para: string[] = [];
  let fence: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    // Fenced blocks (``` and $$) are skipped whole.
    const fenceOpen = line.match(/^(```|~~~|\$\$)/)?.[1] ?? null;
    if (fence) {
      if (line.startsWith(fence) || (fence === "$$" && line.endsWith("$$") && line !== "")) fence = null;
      continue;
    }
    if (fenceOpen) {
      // A one-line $$…$$ closes on the same line.
      if (!(fenceOpen === "$$" && line.length > 2 && line.endsWith("$$"))) fence = fenceOpen;
      if (para.length) break;
      continue;
    }
    if (!line) {
      if (para.length) break;
      continue;
    }
    if (/^(#|>|<|\||[-*+] |\d+[.)] |!\[|\[\^|---|\*\*\*|import |export )/.test(line)) {
      if (para.length) break;
      continue;
    }
    para.push(line);
  }

  const text = cleanInline(para.join(" "));
  return truncate(text, max);
}

function cleanInline(s: string): string {
  return s
    .replace(wikilinkRe(), (whole, pub, type, slug, section, label) => buildWikilink(pub, type, slug, section, label)?.display ?? whole)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url)
    .replace(/\\(?:cite|eqref|ref)\{[^}]*\}/g, "") // references read as noise out of context
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^*\w])[*_](.+?)[*_](?=[^*\w]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1") // a removed reference left a gap before punctuation
    .trim();
}

/** Cut at a word boundary, never inside an inline `$…$`. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const dollars = (cut.match(/(?<!\\)\$/g) ?? []).length;
  if (dollars % 2 === 1) cut = cut.slice(0, cut.lastIndexOf("$"));
  const space = cut.lastIndexOf(" ");
  if (space > max * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s,;:.–—-]+$/, "") + "…";
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Plain excerpt text → safe HTML: everything escaped, each inline `$…$`
 * typeset by KaTeX (errors render as the source, never throw).
 */
export function excerptHtml(text: string): string {
  return text
    .split(/(?<!\\)(\$[^$\n]+\$)/g)
    .map((part) =>
      part.length > 2 && part.startsWith("$") && part.endsWith("$")
        ? katex.renderToString(part.slice(1, -1), { throwOnError: false, output: "html", strict: "ignore" })
        : escapeHtml(part)
    )
    .join("");
}
