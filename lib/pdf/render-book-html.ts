import { KATEX_CSS } from "./katex-css.generated";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import { remarkFencedEmbedsStatic } from "@/lib/remark-fenced-embeds";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { mdxSanitizeSchema } from "@/lib/mdx-sanitize";
import { normalizeDetailsBlocks } from "@/lib/normalize-details";
import type { EventRow } from "@/lib/timeline-utils";
import { renderTimelineHtml } from "@/lib/events-html";

export interface BookSection {
  title: string;
  content?: string | null;
  partTitle?: string | null;
  chapterTitle?: string | null;
}

export function cleanMdx(mdx: string): string {
  return normalizeDetailsBlocks(mdx)
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const parts = inner.split("|");
      return parts[parts.length - 1].split(":").pop() ?? inner;
    })
    .replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, "")
    .replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, "");
}

export async function mdxToHtml(mdx: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkFencedEmbedsStatic)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeSanitize, mdxSanitizeSchema)
    .use(rehypeStringify)
    .process(cleanMdx(mdx));
  return String(file);
}

function getKatexCss(): string {
  return KATEX_CSS;
}

export const PRINT_CSS = `
  @page { margin: 2.5cm 2.5cm; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: none;
    margin: 0;
  }
  h1 { font-size: 22pt; margin: 0 0 6pt; font-weight: bold; }
  h2 { font-size: 16pt; margin: 18pt 0 6pt; }
  h3 { font-size: 13pt; margin: 14pt 0 4pt; }
  h4, h5, h6 { font-size: 11pt; margin: 10pt 0 4pt; }
  p { margin: 0 0 8pt; orphans: 3; widows: 3; }
  pre, code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    background: #f5f5f5;
  }
  pre { padding: 8pt; margin: 8pt 0; border-radius: 3pt; overflow-wrap: break-word; white-space: pre-wrap; }
  code { padding: 1pt 3pt; border-radius: 2pt; }
  pre code { padding: 0; background: none; }
  blockquote { margin: 8pt 0 8pt 20pt; padding-left: 10pt; border-left: 3pt solid #ccc; color: #444; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th, td { border: 0.5pt solid #bbb; padding: 4pt 8pt; }
  th { background: #f0f0f0; font-weight: bold; }
  img { max-width: 100%; }
  a { color: inherit; text-decoration: underline; }

  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 80vh;
    text-align: center;
    page-break-after: always;
  }
  .cover-page h1 { font-size: 32pt; margin-bottom: 12pt; }
  .cover-page .subtitle { font-size: 13pt; color: #555; }

  .toc-page { page-break-after: always; }
  .toc-page h2 { font-size: 18pt; margin-bottom: 16pt; }
  .toc-entry { display: flex; align-items: baseline; margin-bottom: 4pt; }
  .toc-part { font-size: 10pt; color: #555; font-style: italic; margin-bottom: 2pt; margin-top: 8pt; }
  .toc-chapter { font-size: 10pt; color: #666; margin-bottom: 2pt; margin-top: 4pt; padding-left: 10pt; }
  .toc-title { font-size: 11pt; }
  .toc-dots { flex: 1; border-bottom: 1pt dotted #bbb; margin: 0 6pt 2pt; }
  .toc-num { font-size: 11pt; }

  .section { page-break-before: always; }
  .section-header { margin-bottom: 18pt; border-bottom: 1pt solid #ccc; padding-bottom: 8pt; }
  .section-part { font-size: 10pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4pt; }
  .section-chapter { font-size: 12pt; color: #444; font-weight: bold; margin-bottom: 4pt; }
  .section-title { font-size: 20pt; font-weight: bold; margin: 0; }

  /* KaTeX display math centering */
  .katex-display { margin: 10pt 0; text-align: center; }
`;

function buildTocHtml(entries: BookSection[]): string {
  const rows = entries
    .map((s, i) => {
      const partRow = s.partTitle
        ? `<div class="toc-part">${escapeHtml(s.partTitle)}</div>`
        : "";
      const chapterRow = s.chapterTitle
        ? `<div class="toc-chapter">${escapeHtml(s.chapterTitle)}</div>`
        : "";
      return `${partRow}${chapterRow}
      <div class="toc-entry">
        <span class="toc-title">${escapeHtml(s.title)}</span>
        <span class="toc-dots"></span>
        <span class="toc-num">${i + 1}</span>
      </div>`;
    })
    .join("\n");
  return `<div class="toc-page"><h2>Contents</h2>${rows}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderBookHtml(
  bookTitle: string,
  sections: BookSection[],
  events?: EventRow[]
): Promise<string> {
  const katexCss = getKatexCss();

  const sectionHtmlParts = await Promise.all(
    sections.map(async (s, i) => {
      const bodyHtml = await mdxToHtml(s.content ?? "");
      const partHtml = s.partTitle
        ? `<div class="section-part">${escapeHtml(s.partTitle)}</div>`
        : "";
      const chapterHtml = s.chapterTitle
        ? `<div class="section-chapter">${escapeHtml(s.chapterTitle)}</div>`
        : "";
      return `<div class="section" id="sec-${i + 1}">
        <div class="section-header">
          ${partHtml}
          ${chapterHtml}
          <h1 class="section-title">${escapeHtml(s.title)}</h1>
        </div>
        <div class="section-body">${bodyHtml}</div>
      </div>`;
    })
  );

  const timelineHtml = events && events.length > 0
    ? `<div class="section">${renderTimelineHtml(events)}</div>`
    : "";

  const tocSections: BookSection[] = events && events.length > 0
    ? [...sections, { title: "Timeline" }]
    : sections;

  const coverHtml = `<div class="cover-page">
    <h1>${escapeHtml(bookTitle)}</h1>
    <div class="subtitle">Principia Synthesia</div>
  </div>`;

  const tocHtml = buildTocHtml(tocSections);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(bookTitle)}</title>
  <style>${katexCss}</style>
  <style>${PRINT_CSS}</style>
</head>
<body>
  ${coverHtml}
  ${tocHtml}
  ${sectionHtmlParts.join("\n")}
  ${timelineHtml}
</body>
</html>`;
}
