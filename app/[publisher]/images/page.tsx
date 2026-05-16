import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import ImageManager from "./ImageManager";

export default async function ImagesPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
  }

  // Load images server-side when the blob token is available;
  // fall back to an empty list and let the client fetch on mount.
  let initialImages: Array<{
    url: string;
    pathname: string;
    size: number;
    uploadedAt: string;
  }> = [];

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({
        prefix: `images/${publisherSlug}/`,
        limit: 1000,
      });
      initialImages = blobs
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
    } catch {
      // Non-fatal — client will retry via the list API route
      initialImages = [];
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold themed-heading">Images</h1>
        <p className="text-sm themed-muted mt-1">
          Images for <span className="font-medium">@{publisherSlug}</span>
        </p>
      </div>
      <ImageManager publisherSlug={publisherSlug} initialImages={initialImages} />
    </main>
  );
}
