export type AltTextFinding = {
  line: number;
  src: string;
};

const MARKDOWN_EMPTY_ALT = /!\[\]\(([^)]*)\)/g;
const HTML_IMG_TAG = /<img\s[^>]*>/gi;
const ARTICLE_IMAGE_TAG = /<ArticleImage\s[^/]*\/>/gi;
const ALT_ATTR_NONEMPTY = /\balt=(?:"[^"]+"|'[^']+'|{[^}]+})/;
const ALT_EMPTY_DECORATIVE = /\balt=""\s+role="presentation"/;

export function findMissingAlt(mdx: string): AltTextFinding[] {
  const findings: AltTextFinding[] = [];
  const lines = mdx.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const line = lines[lineIdx];

    let m: RegExpExecArray | null;

    MARKDOWN_EMPTY_ALT.lastIndex = 0;
    while ((m = MARKDOWN_EMPTY_ALT.exec(line)) !== null) {
      findings.push({ line: lineNum, src: m[1] ?? "" });
    }

    HTML_IMG_TAG.lastIndex = 0;
    while ((m = HTML_IMG_TAG.exec(line)) !== null) {
      const tag = m[0];
      if (ALT_EMPTY_DECORATIVE.test(tag)) continue;
      if (!ALT_ATTR_NONEMPTY.test(tag)) {
        const srcMatch = /\bsrc=["']([^"']*)/i.exec(tag);
        findings.push({ line: lineNum, src: srcMatch?.[1] ?? "" });
      }
    }

    ARTICLE_IMAGE_TAG.lastIndex = 0;
    while ((m = ARTICLE_IMAGE_TAG.exec(line)) !== null) {
      const tag = m[0];
      if (!ALT_ATTR_NONEMPTY.test(tag)) {
        const srcMatch = /\bsrc=["']([^"']*)/i.exec(tag);
        findings.push({ line: lineNum, src: srcMatch?.[1] ?? "" });
      }
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}
