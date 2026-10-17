import { pdfEmbed } from "@/lib/pdf-embed";

/**
 * A PDF in the page: the browser's own viewer in a frame, with the title and
 * an "Open" link above it (the link is what print, EPUB and browsers without
 * an inline viewer fall back to). Authored as
 * `<Pdf src="/api/files/…" title="Griffiths" page={112} />`.
 */
export default function PdfEmbed(props: { src?: string; page?: number | string; title?: string; height?: number | string }) {
  const pdf = pdfEmbed(props);
  if (!pdf) return null;
  return (
    <figure className="ps-pdf">
      <figcaption className="ps-pdf-bar">
        <span className="ps-pdf-title">{pdf.title}</span>
        {pdf.page && <span className="ps-pdf-page">p. {pdf.page}</span>}
        <a href={pdf.href} target="_blank" rel="noopener noreferrer" className="ps-pdf-open">
          Open PDF ↗
        </a>
      </figcaption>
      <iframe src={pdf.frameSrc} title={pdf.title} loading="lazy" className="ps-pdf-frame" style={{ height: pdf.height }} />
    </figure>
  );
}
