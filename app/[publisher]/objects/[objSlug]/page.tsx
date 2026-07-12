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
    <main className="w-full max-w-5xl mx-auto px-5 py-12 sm:py-16">

      <Link href={`/${publisherSlug}/objects`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5m7-7-7 7 7 7" />
        </svg>
        Objects
      </Link>

      <div className="flex items-start justify-between mb-10 gap-4">
        <div className="flex-1 min-w-0">
          <span className="themed-badge capitalize mb-3 inline-block">{obj.type}</span>
          <h1 className="ps-display themed-heading mb-3" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            {obj.name}
          </h1>
          {obj.description && (
            <p className="themed-muted" style={{ fontSize: "1rem", lineHeight: 1.7 }}>{obj.description}</p>
          )}
        </div>
        {isEditor && (
          <Link href={`/${publisherSlug}/objects/${objSlug}/edit`} className="themed-btn-outline shrink-0" style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}>
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
                  <th key={i} className="border themed-border px-3 py-2 text-left font-semibold themed-muted-bg">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, ri) => (
                <tr key={ri} className="even:[background:var(--muted)]">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border themed-border px-3 py-2">
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
