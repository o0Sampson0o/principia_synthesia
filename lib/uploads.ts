/**
 * Upload rules shared by the token route (app/api/uploads), the file-serving
 * route (app/api/files) and the browser helper (lib/upload-client.ts).
 *
 * Files go from the browser straight to Vercel Blob ("client uploads"): the
 * server only signs a short-lived token after checking the session may edit
 * the publisher. The old path streamed every upload through a function, whose
 * 4.5 MB request cap sat below the advertised 5 MB image limit.
 *
 * Two kinds:
 *  - image: `images/<publisher>/<uuid>.<ext>`, public — served from the CDN
 *    under /images/… exactly as before (next.config rewrite).
 *  - file (PDF): `files/<publisher>/<uuid>/<name>.pdf`, served only through
 *    /api/files/…, never by its storage URL. Stored PRIVATE when a private
 *    Blob store is connected (BLOB_PRIVATE_READ_WRITE_TOKEN); otherwise in
 *    the public store under an unguessable 122-bit path.
 */

export type UploadKind = "image" | "file";

export const UPLOAD_RULES: Record<UploadKind, { maxBytes: number; contentTypes: string[]; label: string }> = {
  image: {
    maxBytes: 20 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    label: "JPEG, PNG, GIF or WebP up to 20 MB",
  },
  file: {
    maxBytes: 100 * 1024 * 1024,
    contentTypes: ["application/pdf"],
    label: "PDF up to 100 MB",
  },
};

const PUB = "[a-z0-9-]+";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Images may carry an author-chosen name instead of a UUID (the uploader offers one).
const NAME = "[a-z0-9][a-z0-9._-]{0,80}";
const IMAGE_PATH_RE = new RegExp(`^images/(${PUB})/(${UUID}|${NAME})\\.(jpg|png|gif|webp)$`);
const FILE_PATH_RE = new RegExp(`^files/(${PUB})/(${UUID})/([a-z0-9][a-z0-9._-]{0,80})\\.pdf$`);

/** Which kind a storage pathname is, and whose — or null if it is neither shape. */
export function parseUploadPath(pathname: string): { kind: UploadKind; publisher: string } | null {
  let m = IMAGE_PATH_RE.exec(pathname);
  if (m) return { kind: "image", publisher: m[1] };
  m = FILE_PATH_RE.exec(pathname);
  if (m) return { kind: "file", publisher: m[1] };
  return null;
}

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

/** Filename → a safe, readable stem (no extension). */
export function fileStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  return (
    stem
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, 80) || "document"
  );
}

/** The storage pathname for a new upload, or null if the type is not allowed. */
export function buildUploadPath(
  kind: UploadKind,
  publisher: string,
  file: { name: string; type: string },
  uuid: string,
  /** Images only: a chosen name in place of the UUID. */
  imageName?: string
): string | null {
  if (!UPLOAD_RULES[kind].contentTypes.includes(file.type)) return null;
  if (kind === "image") {
    const stem = imageName?.trim() ? fileStem(imageName) : uuid;
    return `images/${publisher}/${stem}.${IMAGE_EXT[file.type]}`;
  }
  return `files/${publisher}/${uuid}/${fileStem(file.name)}.pdf`;
}

/** The URL authors put in their content for an uploaded file. */
export function servedUrl(pathname: string): string {
  return pathname.startsWith("files/") ? `/api/${pathname}` : `/${pathname}`;
}

/** The kind an arbitrary dropped/pasted file would be uploaded as, if any. */
export function kindForType(type: string): UploadKind | null {
  if (UPLOAD_RULES.image.contentTypes.includes(type)) return "image";
  if (UPLOAD_RULES.file.contentTypes.includes(type)) return "file";
  return null;
}
