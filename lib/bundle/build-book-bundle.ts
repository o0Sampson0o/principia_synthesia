import JSZip from "jszip";
import { mdxToHtml, PRINT_CSS, cleanMdx } from "@/lib/pdf/render-book-html";

interface BookChapter {
  title: string;
  content: string | null;
  partTitle?: string | null;
}

export async function buildBookBundle(
  bookSlug: string,
  bookTitle: string,
  chapters: BookChapter[],
  animationCodes: Map<string, string>
): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // Build each chapter HTML
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const raw = ch.content ?? "";

    // Replace <DynamicAnimation slug="..."> / > with inlined canvas+script blocks
    // before cleanMdx strips them
    const withAnimations = raw.replace(
      /<DynamicAnimation[^>]+slug="([^"]+)"[^>]*\/?>/g,
      (_, slug) => {
        const code = animationCodes.get(slug);
        if (!code) return "";
        const canvasId = `canvas-${slug}`;
        const patchedCode = code.replace(
          /document\.getElementById\(['"]canvas['"]\)/,
          `document.getElementById('${canvasId}')`
        );
        return `
<div class="animation-container" style="margin:2rem 0;text-align:center">
  <canvas id="${canvasId}" width="600" height="400" style="max-width:100%;border:1px solid #e5e7eb;border-radius:0.5rem"></canvas>
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
        ? `ch-${String(i).padStart(3, "0")}-${slugify(chapters[i - 1].title)}.html`
        : null;
    const nextFile =
      i < chapters.length - 1
        ? `ch-${String(i + 2).padStart(3, "0")}-${slugify(chapters[i + 1].title)}.html`
        : null;

    const navLinks = [
      prevFile ? `<a href="${prevFile}">&larr; Previous</a>` : "",
      `<a href="../index.html">Table of Contents</a>`,
      nextFile ? `<a href="${nextFile}">Next &rarr;</a>` : "",
    ]
      .filter(Boolean)
      .join(" &middot; ");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(ch.title)} &mdash; ${escapeHtml(bookTitle)}</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <nav class="chapter-nav">${navLinks}</nav>
  <main>
    <h1>${escapeHtml(ch.title)}</h1>
    ${bodyHtml}
  </main>
  <nav class="chapter-nav">${navLinks}</nav>
  <script src="../router.js"></script>
</body>
</html>`;

    const filename = `ch-${String(i + 1).padStart(3, "0")}-${slugify(ch.title)}.html`;
    zip.folder("chapters")!.file(filename, html);
  }

  // index.html
  const chapterLinks = chapters
    .map((ch, i) => {
      const file = `chapters/ch-${String(i + 1).padStart(3, "0")}-${slugify(ch.title)}.html`;
      return `<li><a href="${file}">${escapeHtml(ch.title)}</a></li>`;
    })
    .join("\n");

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
    <p>${chapters.length} chapter${chapters.length !== 1 ? "s" : ""}</p>
    <ol class="chapter-list">${chapterLinks}</ol>
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
  const manifest = {
    title: bookTitle,
    bookSlug,
    generatedAt: new Date().toISOString(),
    chapters: chapters.map((ch, i) => ({
      index: i + 1,
      title: ch.title,
      file: `chapters/ch-${String(i + 1).padStart(3, "0")}-${slugify(ch.title)}.html`,
    })),
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
