import crypto from "crypto";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Maps a MIME type to a file extension. Returns null if not in the allowed set. */
export function extensionForMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/**
 * Returns the publisher slug embedded in a blob pathname of the form
 * `images/<publisher-slug>/<filename>.<ext>`, or null for any other shape.
 * No nested paths are allowed (the filename must not contain `/`).
 */
export function publisherFromBlobPath(pathname: string): string | null {
  const match = /^images\/([a-z0-9-]+)\/[^/]+$/.exec(pathname);
  return match ? match[1] : null;
}

/** Builds a new blob key for an upload: `images/<publisher-slug>/<uuid>.<ext>`. */
export function buildBlobKey(publisherSlug: string, ext: string): string {
  const uuid = crypto.randomUUID();
  return `images/${publisherSlug}/${uuid}.${ext}`;
}

/**
 * Returns true if the given URL's hostname matches
 * `*.public.blob.vercel-storage.com`.
 */
export function isBlobUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return (
      protocol === "https:" &&
      hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}
