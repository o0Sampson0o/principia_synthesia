import { upload } from "@vercel/blob/client";
import { buildUploadPath, kindForType, servedUrl, UPLOAD_RULES, type UploadKind } from "@/lib/uploads";
import { uploadAccess } from "@/lib/upload-access";

export interface UploadedFile {
  kind: UploadKind;
  /** What goes into content: the CDN URL for images, /api/files/… for files. */
  url: string;
  pathname: string;
  /** The original filename, for alt text / titles. */
  name: string;
}

/** Thrown with a message an author can act on (wrong type, too large, refused). */
export class UploadError extends Error {}

/**
 * Upload one file from the browser straight to storage (see lib/uploads.ts).
 * The kind comes from the file's type; anything else is refused up front.
 */
export async function uploadFile(
  file: File,
  publisherSlug: string,
  opts: { onProgress?: (fraction: number) => void; imageName?: string } = {}
): Promise<UploadedFile> {
  const kind = kindForType(file.type);
  if (!kind) throw new UploadError(`Can't upload ${file.name}: only images (${UPLOAD_RULES.image.label}) and PDFs.`);
  const rules = UPLOAD_RULES[kind];
  if (file.size > rules.maxBytes) throw new UploadError(`${file.name} is too large — ${rules.label}.`);

  const pathname = buildUploadPath(kind, publisherSlug, file, crypto.randomUUID(), opts.imageName);
  if (!pathname) throw new UploadError(`Can't upload ${file.name}.`);

  try {
    const blob = await upload(pathname, file, {
      access: await uploadAccess(kind),
      handleUploadUrl: "/api/uploads",
      contentType: file.type,
      onUploadProgress: opts.onProgress ? (e) => opts.onProgress!(e.percentage / 100) : undefined,
    });
    return { kind, url: kind === "image" ? blob.url : servedUrl(blob.pathname), pathname: blob.pathname, name: file.name };
  } catch (err) {
    throw new UploadError(err instanceof Error ? err.message : "Upload failed.");
  }
}
