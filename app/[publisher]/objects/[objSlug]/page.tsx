import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import DynamicAnimation from "@/components/DynamicAnimation";
import DiagramRenderer from "@/components/DiagramRenderer";
import { isDiagramContent, isDatasetContent, type KaoContent } from "@/lib/kao";

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
  const content = obj.content as KaoContent;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
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

      {obj.type === "dataset" && isDatasetContent(content) && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse themed-surface rounded">
            <thead>
              <tr>
                {content.headers.map((h, i) => (
                  <th key={i} className="border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-left font-semibold bg-zinc-100 dark:bg-zinc-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, ri) => (
                <tr key={ri} className="even:bg-zinc-50 dark:even:bg-zinc-900">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-zinc-300 dark:border-zinc-600 px-3 py-2">
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {obj.type === "diagram" && isDiagramContent(content) && (
        <div className="mt-6">
          <DiagramRenderer format={content.format} source={content.source} />
        </div>
      )}
    </main>
  );
}
