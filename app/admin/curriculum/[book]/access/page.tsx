import { db } from "@/db";
import { curriculumEntries, resourceVisibility, accessGrants, users, organizations } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  setResourceVisibility,
  addAccessGrant,
  removeAccessGrant,
} from "@/app/admin/access/actions";

export default async function BookAccessPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookSlug } = await params;

  // Verify book exists
  const bookEntries = await db
    .select({ bookTitle: curriculumEntries.bookTitle })
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .limit(1);

  if (!bookEntries[0]) notFound();

  const bookTitle = bookEntries[0].bookTitle;

  // Current visibility setting
  const visibilityRow = await db
    .select({ id: resourceVisibility.id, isPrivate: resourceVisibility.isPrivate })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, "book"),
        eq(resourceVisibility.resourceKey, bookSlug)
      )
    )
    .limit(1);

  const isPrivate = visibilityRow[0]?.isPrivate ?? false;

  // Current grants
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
        eq(accessGrants.resourceKey, bookSlug)
      )
    );

  // Hydrate grantee names
  const userGrantIds = grants.filter((g) => g.granteeType === "user").map((g) => g.granteeId);
  const orgGrantIds = grants.filter((g) => g.granteeType === "org").map((g) => g.granteeId);

  const grantedUsers =
    userGrantIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, userGrantIds))
      : [];

  const grantedOrgs =
    orgGrantIds.length > 0
      ? await db
          .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
          .from(organizations)
          .where(inArray(organizations.id, orgGrantIds))
      : [];

  const userMap = new Map(grantedUsers.map((u) => [u.id, u.email]));
  const orgMap = new Map(grantedOrgs.map((o) => [o.id, { name: o.name, slug: o.slug }]));

  // All users and orgs for the "add grant" forms
  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
  const allOrgs = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link
          href="/admin/curriculum"
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          ← Back to Curriculum
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-1">Access Control</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
        {bookTitle}{" "}
        <span className="text-zinc-400 dark:text-zinc-500">({bookSlug})</span>
      </p>

      {/* Visibility toggle */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          Visibility
        </h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Current status:{" "}
            {isPrivate ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">Private</span>
            ) : (
              <span className="font-semibold text-green-600 dark:text-green-400">Public</span>
            )}
          </p>
          <form action={setResourceVisibility} className="flex items-center gap-3">
            <input type="hidden" name="resourceType" value="book" />
            <input type="hidden" name="resourceKey" value={bookSlug} />
            <button
              type="submit"
              name="isPrivate"
              value={isPrivate ? "false" : "true"}
              className="text-sm px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {isPrivate ? "Make Public" : "Make Private"}
            </button>
          </form>
        </div>
      </section>

      {/* Current grants */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          Access Grants
        </h2>
        {grants.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No grants yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Grantee</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const label =
                  g.granteeType === "user"
                    ? (userMap.get(g.granteeId) ?? `User #${g.granteeId}`)
                    : (orgMap.get(g.granteeId)?.name ?? `Org #${g.granteeId}`);
                return (
                  <tr key={g.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-2 pr-4 capitalize text-zinc-600 dark:text-zinc-400">
                      {g.granteeType}
                    </td>
                    <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">{label}</td>
                    <td className="py-2 text-right">
                      <form action={removeAccessGrant}>
                        <input type="hidden" name="grantId" value={g.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Add grant forms */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          Add Grant
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Grant to user */}
          <form action={addAccessGrant} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <input type="hidden" name="resourceType" value="book" />
            <input type="hidden" name="resourceKey" value={bookSlug} />
            <input type="hidden" name="granteeType" value="user" />
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              Grant to User
            </label>
            <select
              name="granteeId"
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 mb-3 focus:outline-none"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Grant access
            </button>
          </form>

          {/* Grant to org */}
          <form action={addAccessGrant} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <input type="hidden" name="resourceType" value="book" />
            <input type="hidden" name="resourceKey" value={bookSlug} />
            <input type="hidden" name="granteeType" value="org" />
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              Grant to Organization
            </label>
            {allOrgs.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
                No organizations yet.{" "}
                <Link href="/admin/access/orgs" className="underline underline-offset-2">
                  Create one
                </Link>
              </p>
            ) : (
              <select
                name="granteeId"
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 mb-3 focus:outline-none"
              >
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            {allOrgs.length > 0 && (
              <button
                type="submit"
                className="text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Grant access
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
