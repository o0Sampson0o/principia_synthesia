import { notFound, redirect } from "next/navigation";
import ToastForm from "@/components/ToastForm";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { getOrgRole, isSuperAdminProtected } from "@/lib/roles";
import { db } from "@/db";
import { organizations, orgMemberships, users, orgInvitations } from "@/db/schema";
import { eq, notInArray, and, isNull, gt } from "drizzle-orm";
import Link from "next/link";
import { addOrgMember, removeOrgMember, leaveOrg, updateOrgMemberRole } from "@/app/organizations/actions";
import { inviteMember, cancelInvitation, resendInvitation } from "@/app/[publisher]/members/actions";

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

  const pendingInvitations = canManage
    ? await db
        .select({
          id: orgInvitations.id,
          email: orgInvitations.email,
          role: orgInvitations.role,
          expiresAt: orgInvitations.expiresAt,
          createdAt: orgInvitations.createdAt,
        })
        .from(orgInvitations)
        .where(
          and(
            eq(orgInvitations.orgId, orgId),
            isNull(orgInvitations.acceptedAt),
            gt(orgInvitations.expiresAt, new Date())
          )
        )
    : [];

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

  async function sendInvite(formData: FormData) {
    "use server";
    return inviteMember(publisherSlug, null, formData);
  }

  async function cancelInvite(formData: FormData) {
    "use server";
    await cancelInvitation(publisherSlug, formData);
  }

  async function resendInvite(formData: FormData) {
    "use server";
    await resendInvitation(publisherSlug, formData);
  }

  return (
    <main className="w-full max-w-2xl mx-auto px-5 py-12 sm:py-16">
      <Link href={`/${publisherSlug}`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5m7-7-7 7 7 7" />
        </svg>
        {org.name}
      </Link>

      <div className="flex items-end justify-between mb-10 gap-4">
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          Members
        </h1>
        {!currentIsProtected && currentMember && (
          <form action={leave}>
            <input type="hidden" name="orgId" value={orgId} />
            <button
              type="submit"
              className="themed-btn-ghost shrink-0"
              style={{ fontSize: "0.8125rem", color: "var(--color-error)" }}
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium themed-heading truncate">
                      {m.displayName || m.email}
                      {isMe && <span className="ml-2 text-xs themed-muted">(you)</span>}
                    </p>
                    {m.displayName && (
                      <p className="text-xs themed-muted truncate">{m.email}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
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

      {/* Pending invitations — admin/super_admin only */}
      {canManage && pendingInvitations.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold themed-heading mb-4">Pending invitations</h2>
          <ul className="space-y-2">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="px-4 py-3 rounded-lg border themed-border themed-surface flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <p className="text-sm font-medium themed-heading">{inv.email}</p>
                  <p className="text-xs themed-muted">
                    {inv.role} · Expires {inv.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={resendInvite}>
                    <input type="hidden" name="invitationId" value={inv.id} />
                    <button type="submit" className="text-xs themed-btn-ghost px-2 py-1">
                      Resend
                    </button>
                  </form>
                  <form action={cancelInvite}>
                    <input type="hidden" name="invitationId" value={inv.id} />
                    <button type="submit" className="text-xs text-red-500 themed-btn-ghost px-2 py-1">
                      Cancel
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Invite by email — admin/super_admin only */}
      {canManage && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold themed-heading mb-1">Invite by email</h2>
          <p className="text-sm themed-muted mb-4">
            Send an invitation link to anyone. They do not need an existing account.
          </p>
          <ToastForm action={sendInvite} errorTitle="Invite not sent" className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="block text-sm font-medium themed-secondary mb-1">Email address</label>
              <input
                type="email"
                name="email"
                required
                className="themed-input text-sm w-full"
                placeholder="colleague@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium themed-secondary mb-1">Role</label>
              <select name="role" required className="themed-input text-sm w-full">
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>
            <button type="submit" className="themed-btn-accent rounded text-sm">
              Send invitation
            </button>
          </ToastForm>
        </section>
      )}

      {/* Add member — admin/super_admin only */}
      {canManage && (
        <section>
          <h2 className="text-lg font-semibold themed-heading mb-1">Add existing user</h2>
          <p className="text-sm themed-muted mb-4">
            Add an existing user account to this organisation directly.
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
              <button type="submit" className="themed-btn-accent rounded text-sm">
                Add to organisation
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
