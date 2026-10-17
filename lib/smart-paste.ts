/**
 * Smart paste for the article editor — pure text transforms, no editor or DOM.
 *
 *  - a URL pasted over selected text links that text (Notion's behaviour);
 *  - an arXiv or DOI link on its own becomes a labelled link
 *    ("arXiv:2401.01234", "doi:10.1103/…");
 *  - LaTeX copied from a paper or a .tex file becomes our maths syntax:
 *    `\[…\]` and environments like `\begin{equation}` → a `$$` block,
 *    `\(…\)` → `$…$`.
 *
 * Returns null when the paste should go in exactly as copied.
 */
export function transformPaste(text: string, selection: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const url = singleUrl(t);
  if (url) {
    if (selection.trim() && !selection.includes("\n")) return `[${selection.replace(/[[\]]/g, "")}](${url})`;
    const arxiv = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/[0-9]{7})(v[0-9]+)?(?:\.pdf)?$/i.exec(url);
    if (arxiv) return `[arXiv:${arxiv[1]}${arxiv[2] ?? ""}](https://arxiv.org/abs/${arxiv[1]}${arxiv[2] ?? ""})`;
    const doi = /^https?:\/\/(?:dx\.)?doi\.org\/(10\.[0-9]{4,9}\/\S+)$/i.exec(url);
    if (doi) return `[doi:${decodeURIComponent(doi[1])}](${url})`;
    return null;
  }
  // A bare DOI ("10.1103/PhysRev.47.777") is a link waiting to happen.
  if (/^10\.[0-9]{4,9}\/\S+$/.test(t) && !selection.trim()) return `[doi:${t}](https://doi.org/${t})`;

  return latexToMath(t);
}

function singleUrl(t: string): string | null {
  if (/\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? t : null;
  } catch {
    return null;
  }
}

// Display environments KaTeX renders inside $$…$$.
const DISPLAY_ENV = /^\\begin\{(equation|align|gather|multline|eqnarray|aligned|gathered|split)\*?\}[\s\S]*\\end\{\1\*?\}$/;

/** LaTeX display/inline maths → `$$` / `$` syntax; null if the text is not a formula. */
export function latexToMath(t: string): string | null {
  if (t.includes("$")) return null; // already in our syntax (or prose with prices)
  const display = /^\\\[([\s\S]+)\\\]$/.exec(t);
  if (display) return `$$\n${display[1].trim()}\n$$`;
  if (DISPLAY_ENV.test(t)) return `$$\n${t}\n$$`;
  const inline = /^\\\(([\s\S]+)\\\)$/.exec(t);
  if (inline && !inline[1].includes("\n")) return `$${inline[1].trim()}$`;
  return null;
}

/** Readable alt text / title from a filename ("image.png" from a paste → "Screenshot"). */
export function titleFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  if (/^image$/i.test(stem) || /^screenshot/i.test(stem)) return "Screenshot";
  return stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "File";
}
