import { db } from "@/db";
import { objects } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";

const TYPE_BADGE: Record<string, string> = {
  animation: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  dataset: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  diagram: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

export default async function AdminObjectsPage() {
  const allObjects = await db
    .select()
    .from(objects)
    .orderBy(desc(objects.createdAt));

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Knowledge Objects</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/objects/plugins"
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Plugins →
          </Link>
          <Link
            href="/admin/objects/new"
            className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
          >
            New object
          </Link>
        </div>
      </div>

      {allObjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-3">No objects yet.</p>
          <Link
            href="/admin/objects/new"
            className="text-sm font-medium underline underline-offset-2"
          >
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            <span>Name</span>
            <span>Slug</span>
            <span>Type</span>
            <span>Created</span>
          </div>
          {allObjects.map((obj) => (
            <div
              key={obj.id}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3"
            >
              <Link
                href={`/admin/objects/${obj.slug}`}
                className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-2 truncate"
              >
                {obj.name}
              </Link>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                {obj.slug}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${
                  TYPE_BADGE[obj.type] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {obj.type}
              </span>
              <span className="text-xs text-zinc-300 dark:text-zinc-600 whitespace-nowrap">
                {obj.createdAt?.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
