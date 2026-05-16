import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { requireSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import { listImagesQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const session = await requireSession();

  const { searchParams } = new URL(req.url);
  const validation = listImagesQuerySchema.safeParse({
    publisher: searchParams.get("publisher") ?? "",
  });
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid publisher slug" }, { status: 400 });
  }
  const publisherSlug = validation.data.publisher;

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
    return NextResponse.json({ images: [] });
  }

  const { blobs } = await list({
    prefix: `images/${publisherSlug}/`,
    limit: 1000,
  });

  const images = blobs
    .map((b) => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

  return NextResponse.json({ images });
}
