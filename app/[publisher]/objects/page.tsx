import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { filterVisible } from "@/lib/access";

export default async function PublisherObjectsPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  const isEditor = await canEditContent(session, ownerType, ownerId);

  const rawObjects = await db
    .select({ id: objects.id, slug: objects.slug, name: objects.name, type: objects.type })
    .from(objects)
    .where(and(eq(objects.ownerType, ownerType), eq(objects.ownerId, ownerId)));

  let allObjects = rawObjects;
  if (!isEditor) {
    const refs = rawObjects.map((o) => ({ type: "object" as const, ownerType, ownerId, slug: o.slug }));
    const visRefs = await filterVisible(refs, session);
    const visSlugs = new Set(visRefs.map((r) => r.slug));
    allObjects = rawObjects.filter((o) => visSlugs.has(o.slug));
  }

  return (
    <main className="max-w-5xl mx-auto px-5 py-10 sm:py-14">
      <div className="flex items-end justify-between mb-10 gap-4">
        <div>
          <p className="ps-eyebrow mb-1.5">Objects</p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
            {pub.displayName}
          </h1>
        </div>
        {isEditor && (
          <Link href={`/${publisherSlug}/objects/new`} className="themed-btn-accent rounded-lg shrink-0" style={{ fontSize: "0.8125rem", padding: "0.45rem 1rem" }}>
            + Object
          </Link>
        )}
      </div>

      {allObjects.length === 0 ? (
        <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>No objects yet.</p>
      ) : (
        <div className="ps-content-box">
          {allObjects.map((o) => (
            <div key={o.id} className="ps-content-row">
              <Link href={`/${publisherSlug}/objects/${o.slug}`} className="ps-list-link flex-1 min-w-0">
                {o.name}
              </Link>
              <span className="themed-badge capitalize shrink-0">{o.type}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
