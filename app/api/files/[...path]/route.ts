import { get } from "@vercel/blob";
import { parseUploadPath } from "@/lib/uploads";
import { storeFor } from "@/lib/uploads-server";

export const runtime = "nodejs";

/**
 * GET /api/files/<publisher>/<uuid>/<name>.pdf — serves an uploaded file.
 *
 * Files are only ever addressed through this route, never by their storage
 * URL: from a private store (when connected) that is the only way to read
 * them, and from the public store it keeps the CDN address out of pages.
 * Anyone holding the link can read the file — the path carries a random UUID
 * — the same model as images; per-page access control is not modelled.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  const pathname = `files/${path.join("/")}`;
  const target = parseUploadPath(pathname);
  if (!target || target.kind !== "file") return new Response("Not found", { status: 404 });

  const { access, token } = storeFor("file");
  if (!token) return new Response("File storage is not configured", { status: 503 });

  const ifNoneMatch = req.headers.get("if-none-match") ?? undefined;
  let result;
  try {
    result = await get(pathname, { access, token, ifNoneMatch });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!result) return new Response("Not found", { status: 404 });
  if (result.statusCode === 304) return new Response(null, { status: 304 });

  const name = path[path.length - 1];
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/pdf",
      "Content-Length": String(result.blob.size),
      "Content-Disposition": `inline; filename="${name}"`,
      ETag: result.blob.etag,
      // Immutable content at a random path; private to the browser, not CDNs.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
