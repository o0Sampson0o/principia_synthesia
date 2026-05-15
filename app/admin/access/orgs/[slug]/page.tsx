import { db } from "@/db";
import { organizations, orgMemberships, users } from "@/db/schema";
import { eq, notInArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  deleteOrganization,
  addOrgMember,
  removeOrgMember,
} from "@/app/admin/access/actions";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const org = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org[0]) notFound();

  const orgId = org[0].id;

  // Memberships
  const memberships = await db
    .select({
      id: orgMemberships.id,
      userId: orgMemberships.userId,
      role: orgMemberships.role,
      joinedAt: orgMemberships.joinedAt,
      email: users.email,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.orgId, orgId));

  const memberUserIds = memberships.map((m) => m.userId);

  // Users not already in this org
  const availableUsers =
    memberUserIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(notInArray(users.id, memberUserIds))
      : await db.select({ id: users.id, email: users.email }).from(users);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link
          href="/admin/access/orgs"
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          ← All Organizations
        </Link>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-3xl font-bold">{org[0].name}</h1>
        <form action={deleteOrganization}>
          <input type="hidden" name="orgId" value={orgId} />
          <button
            type="submit"
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
            onClick={(e) => {
              if (!confirm(`Delete organization "${org[0].name}"? This cannot be undone.`)) {
                e.preventDefault();
              }
            }}
          >
            Delete organization
          </button>
        </form>
      </div>
      <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-8">{org[0].slug}</p>

      {/* Members */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          Members
        </h2>
        {memberships.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No members yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">{m.email}</td>
                  <td className="py-2 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 capitalize">
                      {m.role}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <form action={removeOrgMember}>
                      <input type="hidden" name="membershipId" value={m.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Add member */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          Add Member
        </h2>
        {availableUsers.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            All users are already members.{" "}
            <Link href="/admin/access/users" className="underline underline-offset-2">
              Create a new user
            </Link>
          </p>
        ) : (
          <form action={addOrgMember} className="flex items-end gap-3 flex-wrap">
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">User</label>
              <select
                name="userId"
                className="text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none"
              >
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Role</label>
              <select
                name="role"
                className="text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <button
              type="submit"
              className="text-sm px-4 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Add member
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
