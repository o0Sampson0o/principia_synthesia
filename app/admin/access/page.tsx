import Link from "next/link";

export default function AdminAccessPage() {
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

      <h1 className="text-3xl font-bold mb-2">Access Control</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">
        Manage organizations, users, and resource visibility.
      </p>

      <div className="space-y-4">
        <Link
          href="/admin/access/orgs"
          className="block rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Organizations
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Create named groups and manage their members. Organizations can be granted access to
            private resources.
          </p>
        </Link>

        <Link
          href="/admin/access/users"
          className="block rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Users
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Create non-admin user accounts that can be granted access to private content.
          </p>
        </Link>
      </div>
    </main>
  );
}
