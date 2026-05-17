import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canManageOrg, isSuperAdminProtected } from "@/lib/roles";
import { db } from "@/db";
import { organizations, orgMemberships, users } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import Link from "next/link";
import { addOrgMember, removeOrgMember } from "@/app/organizations/actions";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  // Members page only makes sense for org publishers
  if (pub.kind !== "org") notFound();

  const session = await requireSession();
  const orgId = pub.orgId!;

  if (!(await canManageOrg(session, orgId))) {
    redirect(`/${publisherSlug}`);
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, creatorId: organizations.creatorId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) notFound();

  const [rootAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isRootAdmin, true))
    .limit(1);
  const rootAdminId = rootAdmin?.id ?? -1;

  // Current members
  const members = await db
    .select({
      membershipId: orgMemberships.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: orgMemberships.role,
      joinedAt: orgMemberships.joinedAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.orgId, orgId));

  const memberUserIds = members.map((m) => m.userId);

  // Users not yet in the org
  const nonMembers =
    memberUserIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email, displayName: users.displayName })
          .from(users)
          .where(notInArray(users.id, memberUserIds))
      : await db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users);

  const roleLabels: Record<string, string> = {
    super_admin: "Super admin",
    admin: "Admin",
    member: "Member",
  };

  async function addMember(formData: FormData) {
    "use server";
    await addOrgMember(formData);
  }

  async function removeMember(formData: FormData) {
    "use server";
    await removeOrgMember(formData);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <nav className="text-sm themed-muted mb-6">
        <Link href={`/${publisherSlug}`} className="themed-link">{org.name}</Link>
        <span className="mx-2">›</span>
        <span>Members</span>
      </nav>

      <h1 className="text-3xl font-bold themed-heading mb-8">Members</h1>

      {/* Current members */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold themed-heading mb-4">
          {members.length} {members.length === 1 ? "member" : "members"}
        </h2>

        <ul className="space-y-2">
          {members.map((m) => {
            const protected_ = isSuperAdminProtected(m.userId, org.creatorId, rootAdminId);
            return (
              <li
                key={m.membershipId}
                className="flex items-center justify-between px-4 py-3 rounded-lg border themed-border themed-surface"
              >
                <div>
                  <p className="text-sm font-medium themed-heading">
                    {m.displayName || m.email}
                  </p>
                  {m.displayName && (
                    <p className="text-xs themed-muted">{m.email}</p>
                  )}
                  <p className="text-xs themed-muted mt-0.5">{roleLabels[m.role] ?? m.role}</p>
                </div>
                {!protected_ && (
                  <form action={removeMember}>
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <button
                      type="submit"
                      className="text-xs text-red-500 themed-btn-ghost px-2 py-1"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Add member */}
      <section>
        <h2 className="text-lg font-semibold themed-heading mb-1">Add member</h2>
        <p className="text-sm themed-muted mb-4">
          Add an existing user account to this organisation.
        </p>

        {nonMembers.length === 0 ? (
          <p className="text-sm themed-muted">All users are already members.</p>
        ) : (
          <form action={addMember} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="block text-sm font-medium themed-secondary mb-1">User</label>
              <select name="userId" required className="themed-input text-sm w-full">
                <option value="">Select a user…</option>
                {nonMembers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ? `${u.displayName} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium themed-secondary mb-1">Role</label>
              <select name="role" required className="themed-input text-sm w-full">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="themed-btn-primary text-sm">
              Add to organisation
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
