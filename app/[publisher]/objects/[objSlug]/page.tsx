import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import CopySnippet from "@/components/CopySnippet";
import { formatWikilink } from "@/lib/wikilink-syntax";
import ObjectRender from "@/components/ObjectRender";
import { type KaoContent } from "@/lib/kao";

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
  // Labelled so a pasted link reads as the object's name, not its slug.
  const objectWikilink = formatWikilink({
    publisher: publisherSlug,
    type: "objects",
    slug: obj.slug,
    label: obj.name,
  });
  // The full address, so the tag keeps working when pasted into an article
  // belonging to someone else — a bare slug would resolve against *their*
  // publisher and find nothing.
  const embedTag = `<Embed slug="${publisherSlug}:objects:${obj.slug}" />`;

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

      {/* Reference snippets — what to paste into an article to cite or embed
          this object. Every type gets the embed tag: linking to an object and
          rendering one in place are different intentions. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-10">
        <CopySnippet
          value={objectWikilink}
          label="Copy wikilink"
          title={`Link to this object: ${objectWikilink}`}
        />
        <CopySnippet
          value={embedTag}
          label="Copy embed tag"
          title={`Embed this ${obj.type}: ${embedTag}`}
        />
      </div>

      <div className="mt-6">
        <ObjectRender
          publisher={publisherSlug}
          slug={obj.slug}
          type={obj.type}
          content={content}
        />
      </div>
    </main>
  );
}
