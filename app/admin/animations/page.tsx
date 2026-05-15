import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import DeleteButton from "./DeleteButton";

export default async function AnimationsPage() {
  const animations = await db
    .select({
      id: objects.id,
      slug: objects.slug,
      name: objects.name,
      source: objects.source,
      createdAt: objects.createdAt,
    })
    .from(objects)
    .where(eq(objects.type, "animation"))
    .orderBy(asc(objects.createdAt));

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Animations</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/animations/plugins"
            className="px-4 py-2 text-sm rounded border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Plugin gallery
          </Link>
          <Link
            href="/admin/animations/new"
            className="px-4 py-2 text-sm rounded bg-zinc-900 text-white hover:opacity-90 transition-opacity"
          >
            New Animation
          </Link>
        </div>
      </div>

      {animations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
          <p className="text-zinc-400 text-sm mb-3">No animations yet.</p>
          <Link
            href="/admin/animations/new"
            className="text-sm font-medium underline underline-offset-2"
          >
            Create your first animation →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100">
          {animations.map((anim) => (
            <div key={anim.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-zinc-900">{anim.name}</p>
                  {anim.source === "plugin" && (
                    <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
                      Plugin
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  {anim.slug}
                </p>
              </div>
              <div className="flex gap-4">
                <Link
                  href={`/admin/animations/${anim.slug}`}
                  className="text-xs text-zinc-400 hover:text-zinc-700"
                >
                  Edit
                </Link>
                <Link
                  href={`/animations/${anim.slug}`}
                  className="text-xs text-zinc-400 hover:text-zinc-700"
                >
                  Preview
                </Link>
                <DeleteButton slug={anim.slug} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
