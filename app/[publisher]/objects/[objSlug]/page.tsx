import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import DynamicAnimation from "@/components/DynamicAnimation";

export default async function ObjectDetailPage({
  params,
}: {
  params: Promise<{ publisher: string; objSlug: string }>;
}) {
  const { publisher: publisherSlug, objSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [obj] = await db
    .select()
    .from(objects)
    .where(
      and(eq(objects.slug, objSlug), eq(objects.ownerType, ownerType), eq(objects.ownerId, ownerId))
    )
    .limit(1);

  if (!obj) notFound();

  const session = await getSession();
  const isEditor = await canEditContent(session, ownerType, ownerId);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="text-sm themed-muted mb-4">
        <Link href={`/${publisherSlug}`} className="themed-link">@{publisherSlug}</Link>
        {" / "}
        <Link href={`/${publisherSlug}/objects`} className="themed-link">Objects</Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold themed-heading">{obj.name}</h1>
          <p className="text-sm themed-muted mt-1">
            {obj.type} &middot; <code className="font-mono">{obj.slug}</code>
          </p>
          {obj.description && (
            <p className="mt-3 themed-muted">{obj.description}</p>
          )}
        </div>
        {isEditor && (
          <Link
            href={`/${publisherSlug}/objects/${objSlug}/edit`}
            className="text-sm themed-link ml-6 shrink-0"
          >
            Edit
          </Link>
        )}
      </div>

      {obj.type === "animation" && (
        <div className="mt-6">
          <DynamicAnimation publisher={publisherSlug} slug={obj.slug} />
        </div>
      )}

      {obj.type === "dataset" && (
        <div className="mt-6 overflow-x-auto">
          <pre className="text-xs themed-surface rounded p-4 overflow-auto">
            {JSON.stringify(obj.content, null, 2)}
          </pre>
        </div>
      )}

      {obj.type === "diagram" && (
        <div className="mt-6">
          <pre className="text-xs themed-surface rounded p-4 overflow-auto">
            {JSON.stringify(obj.content, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
