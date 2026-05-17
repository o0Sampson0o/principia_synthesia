import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import {
  MAX_IMAGE_BYTES,
  ALLOWED_MIME_TYPES,
  extensionForMime,
  buildBlobKey,
  buildBlobKeyWithName,
} from "@/lib/images";
import { uploadImageQuerySchema } from "@/lib/validations";

// Use the Node.js runtime so Next.js accepts bodies up to the platform limit
// (4.5 MB on Hobby, 50 MB on Pro). The 5 MB cap below keeps us safe on Hobby.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  // Require an authenticated session — redirects to /login if absent
  const session = await requireSession();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const publisherRaw = formData.get("publisher");
  const validation = uploadImageQuerySchema.safeParse({
    publisher: typeof publisherRaw === "string" ? publisherRaw : "",
  });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid publisher slug" },
      { status: 400 }
    );
  }
  const publisherSlug = validation.data.publisher;

  // Resolve the publisher and check edit rights
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) {
    return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
  }
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate MIME type
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 415 }
    );
  }

  // Validate file size
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  const ext = extensionForMime(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const customName = formData.get("name");
  const blobKey =
    typeof customName === "string" && customName.trim()
      ? buildBlobKeyWithName(publisherSlug, customName, ext)
      : buildBlobKey(publisherSlug, ext);

  // BLOB_READ_WRITE_TOKEN may not be set in local dev — surface a clear 503
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image storage is not configured (missing BLOB_READ_WRITE_TOKEN)" },
      { status: 503 }
    );
  }

  const result = await put(blobKey, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
  });

  return NextResponse.json(
    { url: result.url, pathname: result.pathname },
    { status: 201 }
  );
}
