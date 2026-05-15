import { db } from "@/db";
import { users } from "@/db/schema";
import Link from "next/link";
import { createUser } from "@/app/admin/access/actions";

export default async function AdminUsersPage() {
  const allUsers = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin })
    .from(users);

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

      <h1 className="text-3xl font-bold mb-8">Users</h1>

      <section className="mb-10">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="pb-2 font-medium">ID</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                <td className="py-2 pr-4 text-zinc-400 dark:text-zinc-500 tabular-nums">{u.id}</td>
                <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">{u.email}</td>
                <td className="py-2">
                  {u.isAdmin ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      Admin
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      User
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
          Create User
        </h2>
        <form action={createUser} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 bg-transparent text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            className="text-sm px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Create user
          </button>
        </form>
      </section>
    </main>
  );
}
