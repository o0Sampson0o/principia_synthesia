import JSZip from "jszip";
import type { SyncBundleManifest, SyncBundleSection } from "@/lib/validations";

interface SyncSection {
  slug: string;
  title: string;
  partTitle: string | null;
  chapterTitle: string | null;
  position: number;
  isInternal: boolean;
  updatedAt: Date | null;
  content: string | null;
}

export async function buildSyncBundle(
  bookSlug: string,
  bookTitle: string,
  sections: SyncSection[]
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const sectionsFolder = zip.folder("chapters")!;

  const manifestSections: SyncBundleSection[] = sections.map((s) => ({
    slug: s.slug,
    title: s.title,
    partTitle: s.partTitle,
    chapterTitle: s.chapterTitle,
    position: s.position,
    isInternal: s.isInternal,
    updatedAt: (s.updatedAt ?? new Date(0)).toISOString(),
  }));

  for (const s of sections) {
    sectionsFolder.file(`${s.slug}.mdx`, s.content ?? "");
  }

  const manifest: SyncBundleManifest = {
    bookSlug,
    bookTitle,
    exportedAt: new Date().toISOString(),
    sections: manifestSections,
  };
  zip.file("book.json", JSON.stringify(manifest, null, 2));

  return zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
