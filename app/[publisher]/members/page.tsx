import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canManageOrg, getOrgRole, isSuperAdminProtected } from "@/lib/roles";
import { db } from "@/db";
import { organizations, orgMemberships, users } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import Link from "next/link";
import { addOrgMember, removeOrgMember, leaveOrg, updateOrgMemberRole } from "@/app/organizations/actions";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();
  if (pub.kind !== "org") notFound();

  const session = await requireSession();
  const orgId = pub.orgId!;

  // All members can view and leave; only admin/super_admin can manage
  const sessionRole = await getOrgRole(session.userId, orgId);
  if (!sessionRole) redirect(`/${publisherSlug}`);

  const canManage = session.isRootAdmin || sessionRole === "super_admin" || sessionRole === "admin";
  const isSuperAdmin = session.isRootAdmin || sessionRole === "super_admin";

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

  const members = await db
    .select({
      membershipId: orgMemberships.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: orgMemberships.role,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.orgId, orgId));

  const memberUserIds = members.map((m) => m.userId);

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

  const currentMember = members.find((m) => m.userId === session.userId);
  const currentIsProtected = currentMember
    ? isSuperAdminProtected(session.userId, org.creatorId, rootAdminId)
    : true;

  async function addMember(formData: FormData) {
    "use server";
    await addOrgMember(formData);
  }

  async function removeMember(formData: FormData) {
    "use server";
    await removeOrgMember(formData);
  }

  async function leave(formData: FormData) {
    "use server";
    await leaveOrg(formData);
  }

  async function changeRole(formData: FormData) {
    "use server";
    await updateOrgMemberRole(formData);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <nav className="text-sm themed-muted mb-6">
        <Link href={`/${publisherSlug}`} className="themed-link">{org.name}</Link>
        <span className="mx-2">›</span>
        <span>Members</span>
      </nav>

      <div className="flex items-start justify-between mb-8">
        <h1 className="text-3xl font-bold themed-heading">Members</h1>
        {!currentIsProtected && currentMember && (
          <form action={leave}>
            <input type="hidden" name="orgId" value={orgId} />
            <button
              type="submit"
              className="themed-btn-ghost text-sm px-3 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              Leave organisation
            </button>
          </form>
        )}
      </div>

      {/* Member list */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold themed-heading mb-4">
          {members.length} {members.length === 1 ? "member" : "members"}
        </h2>

        <ul className="space-y-2">
          {members.map((m) => {
            const isProtected = isSuperAdminProtected(m.userId, org.creatorId, rootAdminId);
            const isMe = m.userId === session.userId;
            // What roles can the current session assign to this member?
            const canChangeRole = canManage && !isProtected && !isMe;
            const availableRoles = isSuperAdmin
              ? ["super_admin", "admin", "member"]
              : ["admin", "member"]; // admins can't assign super_admin

            return (
              <li
                key={m.membershipId}
                className="px-4 py-3 rounded-lg border themed-border themed-surface"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium themed-heading truncate">
                      {m.displayName || m.email}
                      {isMe && <span className="ml-2 text-xs themed-muted">(you)</span>}
                    </p>
                    {m.displayName && (
                      <p className="text-xs themed-muted truncate">{m.email}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canChangeRole ? (
                      <form action={changeRole} className="flex items-center gap-2">
                        <input type="hidden" name="membershipId" value={m.membershipId} />
                        <select
                          name="role"
                          defaultValue={m.role}
                          className="themed-input text-xs py-1 px-2"
                        >
                          {availableRoles.map((r) => (
                            <option key={r} value={r}>{roleLabels[r]}</option>
                          ))}
                        </select>
                        <button type="submit" className="themed-btn-ghost text-xs px-2 py-1">
                          Save
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs themed-muted">{roleLabels[m.role] ?? m.role}</span>
                    )}

                    {canManage && !isProtected && !isMe && (
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Add member — admin/super_admin only */}
      {canManage && (
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
                  {isSuperAdmin && <option value="super_admin">Super admin</option>}
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <button type="submit" className="themed-btn-primary text-sm">
                Add to organisation
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
