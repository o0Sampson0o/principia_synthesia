/**
 * `<Pdf src="…" page={12} title="…" height="600" />` — shared by the published
 * component (components/PdfEmbed.tsx) and the editor Preview (hast), so the two
 * render the same thing from the same rules.
 *
 * `src` must be one of our uploads (/api/files/…) or an https URL; anything
 * else renders nothing. `page` opens the browser's PDF viewer at that page
 * (`#page=N`, honoured by Chrome, Firefox, Safari and Edge).
 */
export interface PdfEmbed {
  frameSrc: string;
  href: string;
  title: string;
  height: number;
  page: number | null;
}

export function pdfEmbed(props: { src?: unknown; page?: unknown; title?: unknown; height?: unknown }): PdfEmbed | null {
  const src = typeof props.src === "string" ? props.src.trim() : "";
  if (!/^\/api\/files\/[a-z0-9-]+\/[0-9a-f-]{36}\/[a-z0-9._-]+\.pdf$/.test(src) && !/^https:\/\/\S+$/.test(src)) return null;
  const pageNum = Number(props.page);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : null;
  const h = Number(props.height);
  const height = Number.isFinite(h) && h > 0 ? Math.min(Math.max(Math.round(h), 240), 1400) : 640;
  const base = src.split("#")[0];
  const href = page ? `${base}#page=${page}` : base;
  const title =
    typeof props.title === "string" && props.title.trim()
      ? props.title.trim()
      : decodeURIComponent(base.split("/").pop() ?? "PDF").replace(/\.pdf$/i, "");
  return { frameSrc: href, href, title, height, page };
}
