import type { TocEntry } from "@/lib/article-toc";

/**
 * A TOC entry's label: the server-typeset maths when the heading has any
 * (see extractToc), otherwise its plain text.
 */
export default function TocLabel({ entry }: { entry: TocEntry }) {
  if (!entry.html) return <>{entry.text}</>;
  return <span dangerouslySetInnerHTML={{ __html: entry.html }} />;
}
