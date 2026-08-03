import JSZip from "jszip";
import { mdxToHtml, PRINT_CSS, cleanMdx } from "@/lib/pdf/render-book-html";
import type { EventRow } from "@/lib/timeline-utils";
import { renderTimelineHtml } from "@/lib/events-html";
import type { ThemeTokens } from "@/db/schema";

interface BookSection {
  title: string;
  content: string | null;
  partTitle?: string | null;
  chapterTitle?: string | null;
}

export async function buildBookBundle(
  bookSlug: string,
  bookTitle: string,
  sections: BookSection[],
  animationCodes: Map<string, { code: string; height: number }>,
  /**
   * Palette exposed to animation code as `window.theme`. Bundle pages are a
   * static light-styled document, so this is the light set — without it any
   * animation reading `window.theme.foreground` throws on the exported copy.
   */
  themeTokens: ThemeTokens,
  events?: EventRow[]
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const themeScript = `<script>window.theme = ${JSON.stringify(themeTokens)};</script>`;

  // Build each section HTML
  for (let i = 0; i < sections.length; i++) {
    const ch = sections[i];
    const raw = ch.content ?? "";

    // Replace <DynamicAnimation slug="..."> / > with inlined canvas+script blocks
    // before cleanMdx strips them
    const withAnimations = raw.replace(
      /<DynamicAnimation[^>]+slug="([^"]+)"[^>]*\/?>/g,
      (_, slug) => {
        const anim = animationCodes.get(slug);
        if (!anim) return "";
        const { code, height } = anim;
        const canvasId = `canvas-${slug}`;
        const patchedCode = code.replace(
          /document\.getElementById\(['"]canvas['"]\)/,
          `document.getElementById('${canvasId}')`
        );
        return `
<div class="animation-container" style="margin:2rem 0;text-align:center">
  <canvas id="${canvasId}" width="600" height="${height}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:0.5rem"></canvas>
  <script>
    (function() {
      ${patchedCode}
    })();
  </script>
</div>`;
      }
    );

    const bodyHtml = await mdxToHtml(cleanMdx(withAnimations));

    const prevFile =
      i > 0
        ? `sec-${String(i).padStart(3, "0")}-${slugify(sections[i - 1].title)}.html`
        : null;
    const nextFile =
      i < sections.length - 1
        ? `sec-${String(i + 2).padStart(3, "0")}-${slugify(sections[i + 1].title)}.html`
        : null;

    const navLinks = [
      prevFile ? `<a href="${prevFile}">&larr; Previous</a>` : "",
      `<a href="../index.html">Table of Contents</a>`,
      nextFile ? `<a href="${nextFile}">Next &rarr;</a>` : "",
    ]
      .filter(Boolean)
      .join(" &middot; ");

    const partHtml = ch.partTitle
      ? `<p class="section-part">${escapeHtml(ch.partTitle)}</p>`
      : "";
    const chapterHtml = ch.chapterTitle
      ? `<p class="section-chapter">${escapeHtml(ch.chapterTitle)}</p>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(ch.title)} &mdash; ${escapeHtml(bookTitle)}</title>
  <link rel="stylesheet" href="../styles.css">
  ${themeScript}
</head>
<body>
  <nav class="chapter-nav">${navLinks}</nav>
  <main>
    <header>${partHtml}${chapterHtml}<h1>${escapeHtml(ch.title)}</h1></header>
    ${bodyHtml}
  </main>
  <nav class="chapter-nav">${navLinks}</nav>
  <script src="../router.js"></script>
</body>
</html>`;

    const filename = `sec-${String(i + 1).padStart(3, "0")}-${slugify(ch.title)}.html`;
    zip.folder("chapters")!.file(filename, html);
  }

  // timeline.html (optional)
  const timelineHtmlContent = events && events.length > 0 ? renderTimelineHtml(events) : "";
  if (timelineHtmlContent) {
    const timelinePageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Timeline &mdash; ${escapeHtml(bookTitle)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <nav class="chapter-nav"><a href="index.html">&larr; Table of Contents</a></nav>
  <main>${timelineHtmlContent}</main>
</body>
</html>`;
    zip.file("timeline.html", timelinePageHtml);
  }

  // index.html
  const sectionLinks = sections
    .map((ch, i) => {
      const file = `chapters/sec-${String(i + 1).padStart(3, "0")}-${slugify(ch.title)}.html`;
      return `<li><a href="${file}">${escapeHtml(ch.title)}</a></li>`;
    })
    .join("\n");

  const timelineLink = timelineHtmlContent
    ? `\n    <p><a href="timeline.html">Timeline</a></p>`
    : "";

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(bookTitle)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main>
    <h1>${escapeHtml(bookTitle)}</h1>
    <p>${sections.length} section${sections.length !== 1 ? "s" : ""}</p>
    <ol class="chapter-list">${sectionLinks}</ol>${timelineLink}
  </main>
</body>
</html>`;
  zip.file("index.html", indexHtml);

  // styles.css
  const screenCss = `
body { max-width: 700px; margin: 0 auto; padding: 2rem 1.5rem; font-family: Georgia, serif; line-height: 1.7; color: #111; }
h1, h2, h3 { font-family: system-ui, sans-serif; }
a { color: #2563eb; }
.chapter-nav { font-family: system-ui, sans-serif; font-size: 0.875rem; margin: 1.5rem 0; display: flex; gap: 1rem; }
.chapter-list { line-height: 2; }
.section-part { font-family: system-ui, sans-serif; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 0.25rem; }
.section-chapter { font-family: system-ui, sans-serif; font-size: 0.95rem; font-weight: 600; color: #374151; margin: 0 0 0.25rem; }
.animation-container canvas { display: block; margin: 0 auto; }
code { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
pre { background: #f3f4f6; padding: 1rem; border-radius: 6px; overflow-x: auto; }
blockquote { border-left: 4px solid #d1d5db; padding-left: 1rem; color: #6b7280; margin-left: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
th { background: #f9fafb; }
${PRINT_CSS}
`;
  zip.file("styles.css", screenCss);

  // router.js
  const routerJs = `
(function() {
  document.addEventListener("keydown", function(e) {
    var links = document.querySelectorAll(".chapter-nav a");
    if (e.key === "ArrowRight") {
      var next = Array.from(links).find(function(a) { return a.textContent.includes("Next"); });
      if (next) window.location.href = next.href;
    } else if (e.key === "ArrowLeft") {
      var prev = Array.from(links).find(function(a) { return a.textContent.includes("Previous"); });
      if (prev) window.location.href = prev.href;
    }
  });
})();
`;
  zip.file("router.js", routerJs);

  // manifest.json
  const manifestSections = sections.map((ch, i) => ({
    index: i + 1,
    title: ch.title,
    file: `chapters/sec-${String(i + 1).padStart(3, "0")}-${slugify(ch.title)}.html`,
  }));
  if (timelineHtmlContent) {
    manifestSections.push({
      index: sections.length + 1,
      title: "Timeline",
      file: "timeline.html",
    });
  }
  const manifest = {
    title: bookTitle,
    bookSlug,
    generatedAt: new Date().toISOString(),
    sections: manifestSections,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  return zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
