import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import { parseUploadPath, UPLOAD_RULES } from "@/lib/uploads";
import { storeFor } from "@/lib/uploads-server";

export const runtime = "nodejs";

/**
 * POST /api/uploads — signs a browser's direct upload to Vercel Blob.
 *
 * The file never passes through this function (so the 4.5 MB request cap does
 * not apply); this only checks that the session may edit the publisher named
 * in the pathname, that the pathname has the exact shape `lib/uploads.ts`
 * builds, and then issues a token limited to that kind's types and size.
 */
export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // The store (and so the token) depends on the kind, which the pathname says.
  const requested = body.type === "blob.generate-client-token" ? parseUploadPath(body.payload.pathname) : null;
  if (body.type === "blob.generate-client-token" && !requested) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }
  const token = storeFor(requested?.kind ?? "image").token;
  if (!token) {
    return NextResponse.json({ error: "File storage is not configured (missing BLOB_READ_WRITE_TOKEN)" }, { status: 503 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname) => {
        const target = parseUploadPath(pathname);
        if (!target) throw new Error("Invalid upload path");
        const session = await getSession();
        if (!session) throw new Error("Sign in to upload");
        const pub = await resolvePublisher(target.publisher);
        if (!pub) throw new Error("Publisher not found");
        const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
        if (!(await canEditContent(session, pub.kind, ownerId))) throw new Error("You cannot upload to this publisher");
        const rules = UPLOAD_RULES[target.kind];
        return {
          allowedContentTypes: rules.contentTypes,
          maximumSizeInBytes: rules.maxBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload refused" }, { status: 400 });
  }
}
