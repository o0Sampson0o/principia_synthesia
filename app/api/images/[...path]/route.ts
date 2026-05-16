import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import { publisherFromBlobPath } from "@/lib/images";
import { deleteImageBodySchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const session = await requireSession();

  const { path: segments } = await params;
  const pathname = segments.join("/");

  const validation = deleteImageBodySchema.safeParse({ path: pathname });
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid blob path" }, { status: 400 });
  }

  const publisherSlug = publisherFromBlobPath(pathname);
  if (!publisherSlug) {
    return NextResponse.json({ error: "Invalid blob path" }, { status: 400 });
  }

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) {
    return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
  }
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new NextResponse(null, { status: 204 });
  }

  await del(pathname);

  return new NextResponse(null, { status: 204 });
}
