import { db } from "@/db";
import { objects } from "@/db/schema";
import Link from "next/link";
import type { KaoType } from "@/lib/kao";

const TYPE_BADGE: Record<string, string> = {
  animation: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  dataset: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  diagram: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const TYPE_ORDER: KaoType[] = ["animation", "dataset", "diagram"];

export default async function ObjectsPage() {
  const allObjects = await db.select().from(objects).orderBy(objects.name);

  const grouped = new Map<string, typeof allObjects>();
  for (const obj of allObjects) {
    if (!grouped.has(obj.type)) grouped.set(obj.type, []);
    grouped.get(obj.type)!.push(obj);
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight themed-heading mb-2">
        Knowledge Objects
      </h1>
      <p className="themed-muted text-sm mb-10">
        {allObjects.length} {allObjects.length === 1 ? "object" : "objects"} — embed in articles with{" "}
        <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
          {"[[object:slug]]"}
        </code>
      </p>

      {allObjects.length === 0 ? (
        <div className="text-center py-16">
          <p className="themed-muted text-sm">No objects yet.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {TYPE_ORDER.filter((t) => grouped.has(t)).map((type) => (
            <section key={type}>
              <h2 className="text-lg font-semibold capitalize mb-4 flex items-center gap-2">
                {type}s
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                    TYPE_BADGE[type] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {grouped.get(type)!.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.get(type)!.map((obj) => (
                  <Link
                    key={obj.id}
                    href={`/objects/${obj.slug}`}
                    className="block rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                      {obj.name}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mb-2">
                      {obj.slug}
                    </p>
                    {obj.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                        {obj.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
