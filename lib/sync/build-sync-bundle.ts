import JSZip from "jszip";
import type { SyncBundleManifest, SyncBundleChapter } from "@/lib/validations";

interface SyncChapter {
  slug: string;
  title: string;
  partTitle: string | null;
  position: number;
  isInternal: boolean;
  updatedAt: Date | null;
  content: string | null;
}

export async function buildSyncBundle(
  bookSlug: string,
  bookTitle: string,
  chapters: SyncChapter[]
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const chaptersFolder = zip.folder("chapters")!;

  const manifestChapters: SyncBundleChapter[] = chapters.map((c) => ({
    slug: c.slug,
    title: c.title,
    partTitle: c.partTitle,
    position: c.position,
    isInternal: c.isInternal,
    updatedAt: (c.updatedAt ?? new Date(0)).toISOString(),
  }));

  for (const c of chapters) {
    chaptersFolder.file(`${c.slug}.mdx`, c.content ?? "");
  }

  const manifest: SyncBundleManifest = {
    bookSlug,
    bookTitle,
    exportedAt: new Date().toISOString(),
    chapters: manifestChapters,
  };
  zip.file("book.json", JSON.stringify(manifest, null, 2));

  return zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
