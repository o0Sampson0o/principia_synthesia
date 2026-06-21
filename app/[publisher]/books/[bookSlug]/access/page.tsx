import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { books, resourceVisibility, accessGrants, users, organizations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { setBookVisibility, addBookGrant, removeBookGrant } from "./actions";

export default async function BookAccessPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}/books/${bookSlug}`);
  }

  const [book] = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);

  if (!book) notFound();

  // Current visibility
  const [visRow] = await db
    .select({ visibility: resourceVisibility.visibility })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, "book"),
        eq(resourceVisibility.ownerType, ownerType),
        eq(resourceVisibility.ownerId, ownerId),
        eq(resourceVisibility.resourceKey, bookSlug)
      )
    )
    .limit(1);

  const currentVisibility = (visRow?.visibility ?? "public") as "public" | "org" | "private";

  // Existing grants
  const grants = await db
    .select({
      id: accessGrants.id,
      granteeType: accessGrants.granteeType,
      granteeId: accessGrants.granteeId,
      grantedAt: accessGrants.grantedAt,
    })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, "book"),
        eq(accessGrants.ownerType, ownerType),
        eq(accessGrants.ownerId, ownerId),
        eq(accessGrants.resourceKey, bookSlug)
      )
    );

  // Resolve grantee display names
  const grantedUserIds = grants.filter((g) => g.granteeType === "user").map((g) => g.granteeId);
  const grantedOrgIds = grants.filter((g) => g.granteeType === "org").map((g) => g.granteeId);

  const [allUsers, allOrgs] = await Promise.all([
    db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users),
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug }).from(organizations),
  ]);

  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const orgMap = new Map(allOrgs.map((o) => [o.id, o]));

  const ungrantedUsers = allUsers.filter((u) => !grantedUserIds.includes(u.id));
  const ungrantedOrgs = allOrgs.filter((o) => !grantedOrgIds.includes(o.id));

  async function setVisibility(formData: FormData) {
    "use server";
    await setBookVisibility(publisherSlug, bookSlug, formData);
  }

  async function addGrant(formData: FormData) {
    "use server";
    await addBookGrant(publisherSlug, bookSlug, formData);
  }

  async function removeGrant(formData: FormData) {
    "use server";
    await removeBookGrant(publisherSlug, bookSlug, formData);
  }

  const visibilityLabels = {
    public: "Public — anyone can view",
    org: "Organisation members only",
    private: "Private — explicit grants only",
  };

  return (
    <main className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <Link href={`/${publisherSlug}/books/${bookSlug}`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        {book.title}
      </Link>
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Book</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Access control</h1>
      </div>

      {/* Visibility */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold themed-heading mb-1">Visibility</h2>
        <p className="text-sm themed-muted mb-4">
          Controls who can see this book in listings and access it directly.
        </p>

        <div className="space-y-2">
          {(["public", "org", "private"] as const).map((v) => (
            <form key={v} action={setVisibility}>
              <input type="hidden" name="visibility" value={v} />
              <button
                type="submit"
                className={[
                  "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                  currentVisibility === v
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 themed-heading"
                    : "themed-surface themed-border themed-hover-border themed-secondary",
                ].join(" ")}
              >
                <span className="font-medium capitalize">{v}</span>
                <span className="text-sm block themed-muted">{visibilityLabels[v]}</span>
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Grants (only shown for private) */}
      {currentVisibility === "private" && (
        <section>
          <h2 className="text-lg font-semibold themed-heading mb-1">Access grants</h2>
          <p className="text-sm themed-muted mb-4">
            Users and organisations explicitly allowed to view this book.
          </p>

          {grants.length === 0 ? (
            <p className="text-sm themed-muted mb-6">No grants yet.</p>
          ) : (
            <ul className="space-y-2 mb-6">
              {grants.map((g) => {
                const label =
                  g.granteeType === "user"
                    ? userMap.get(g.granteeId)?.email ?? `user #${g.granteeId}`
                    : `${orgMap.get(g.granteeId)?.name ?? `org #${g.granteeId}`} (org)`;
                return (
                  <li
                    key={g.id}
                    className="flex items-center justify-between px-4 py-2 rounded-lg themed-surface border themed-border"
                  >
                    <span className="text-sm themed-heading">{label}</span>
                    <form action={removeGrant}>
                      <input type="hidden" name="grantId" value={g.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-500 themed-btn-ghost px-2 py-1"
                      >
                        Revoke
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Grant user */}
            <div>
              <h3 className="text-sm font-semibold themed-secondary mb-2">Grant user access</h3>
              {ungrantedUsers.length === 0 ? (
                <p className="text-xs themed-muted">All users already have access.</p>
              ) : (
                <form action={addGrant} className="space-y-2">
                  <input type="hidden" name="granteeType" value="user" />
                  <select name="granteeId" required className="themed-input text-sm w-full">
                    <option value="">Select a user…</option>
                    {ungrantedUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName ? `${u.displayName} (${u.email})` : u.email}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="themed-btn-accent rounded text-sm">
                    Grant access
                  </button>
                </form>
              )}
            </div>

            {/* Grant org */}
            {allOrgs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold themed-secondary mb-2">
                  Grant organisation access
                </h3>
                {ungrantedOrgs.length === 0 ? (
                  <p className="text-xs themed-muted">All organisations already have access.</p>
                ) : (
                  <form action={addGrant} className="space-y-2">
                    <input type="hidden" name="granteeType" value="org" />
                    <select name="granteeId" required className="themed-input text-sm w-full">
                      <option value="">Select an organisation…</option>
                      {ungrantedOrgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="themed-btn-accent rounded text-sm">
                      Grant access
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
