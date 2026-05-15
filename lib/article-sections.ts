export interface Section {
  id: string;       // "preamble" for the pre-## block; kebab-slugified heading otherwise
  heading: string;  // raw heading text after "## "; empty string for preamble
  body: string;     // full raw text of this section including the "## heading" line
}

/**
 * Parses the top-level ## sections of an MDX string into Section objects.
 * The first element is always the preamble (content before the first ## heading).
 * Duplicate slugified IDs are disambiguated with -2, -3, etc.
 */
export function parseArticleSections(mdx: string): Section[] {
  const result: Section[] = [];
  const seen = new Map<string, number>();

  let preambleBody: string;
  let sectionChunks: string[];

  if (mdx.startsWith("## ")) {
    // No preamble — all content is sections.
    // Split on "\n## " to separate sections; the first chunk already starts with "## ".
    const parts = mdx.split("\n## ");
    preambleBody = "";
    // First part starts with "## " already; subsequent parts need "## " prepended.
    sectionChunks = parts.map((chunk, i) => (i === 0 ? chunk : "## " + chunk));
  } else {
    // Zeroth chunk before the first "\n## " is the preamble.
    const parts = mdx.split("\n## ");
    preambleBody = parts[0];
    sectionChunks = parts.slice(1).map((chunk) => "## " + chunk);
  }

  // Add preamble (always first)
  result.push({ id: "preamble", heading: "", body: preambleBody });

  // Parse each section chunk
  for (const chunk of sectionChunks) {
    // chunk starts with "## "
    const newlineIdx = chunk.indexOf("\n");
    const headingLine = newlineIdx === -1 ? chunk.slice(3) : chunk.slice(3, newlineIdx);
    const body = chunk;

    // Slugify the heading
    const base = headingLine
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Deduplicate
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;

    result.push({ id, heading: headingLine, body });
  }

  return result;
}

/**
 * Reconstructs an MDX string from a preamble body and an ordered list of
 * non-preamble sections. Each section.body already contains its "## heading" line.
 */
export function reconstructMdx(preamble: string, sections: Section[]): string {
  const parts = sections.map((s) => s.body);
  let mdx: string;
  if (preamble) {
    mdx = preamble + "\n" + parts.join("\n");
  } else {
    mdx = parts.join("\n");
  }
  return mdx.trimEnd() + "\n";
}
