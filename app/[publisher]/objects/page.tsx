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
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold themed-heading mb-1">{pub.displayName}&rsquo;s objects</h1>
          <p className="themed-muted text-sm">@{pub.slug}</p>
        </div>
        {isEditor && (
          <Link href={`/${publisherSlug}/objects/new`} className="themed-btn-primary text-sm px-4 py-2">
            New object
          </Link>
        )}
      </div>

      {allObjects.length === 0 ? (
        <p className="themed-muted">No objects yet.</p>
      ) : (
        <ul className="space-y-3">
          {allObjects.map((o) => (
            <li key={o.id} className="flex items-center justify-between border-b themed-border pb-3">
              <Link href={`/${publisherSlug}/objects/${o.slug}`} className="themed-link font-medium">
                {o.name}
              </Link>
              <span className="text-xs themed-muted">{o.type}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
