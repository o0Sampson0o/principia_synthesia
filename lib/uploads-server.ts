import type { UploadKind } from "@/lib/uploads";

/**
 * Which Blob store and access mode a kind of upload uses. Files (PDFs) are
 * private when a private store is connected; images stay in the public store
 * (they are served from its CDN). Server-only: reads the store tokens.
 */
export function storeFor(kind: UploadKind): { access: "public" | "private"; token: string | undefined } {
  const privateToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  if (kind === "file" && privateToken) return { access: "private", token: privateToken };
  return { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN };
}
