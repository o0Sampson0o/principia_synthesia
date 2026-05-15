import { db } from "@/db";
import { organizations } from "@/db/schema";
import Link from "next/link";
import { createOrganization } from "@/app/admin/access/actions";

export default async function AdminOrgsPage() {
  const orgs = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, createdAt: organizations.createdAt })
    .from(organizations);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link
          href="/admin/access"
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          ← Back to Access Control
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-8">Organizations</h1>

      {orgs.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-8">No organizations yet.</p>
      ) : (
        <ul className="space-y-2 mb-10">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link
                href={`/admin/access/orgs/${org.slug}`}
                className="block rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {org.name}
                </span>
                <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
                  {org.slug}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Create org form */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          New Organization
        </h2>
        <form action={createOrganization} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              Name
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="My Organization"
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              Slug
            </label>
            <input
              name="slug"
              type="text"
              required
              placeholder="my-organization"
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            className="text-sm px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Create organization
          </button>
        </form>
      </section>
    </main>
  );
}
