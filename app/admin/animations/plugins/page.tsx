import { db } from "@/db";
import { objects } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import Link from "next/link";
import ScanButton, { UninstallButton } from "./PluginActions";

export default async function PluginGalleryPage() {
  const plugins = await db
    .select()
    .from(objects)
    .where(and(eq(objects.type, "animation"), eq(objects.source, "plugin")))
    .orderBy(asc(objects.name));

  const installedSlugs = plugins.map((p) => p.slug);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Plugin Gallery</h1>
        <Link
          href="/admin/animations"
          className="text-sm text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
        >
          Back to Animations
        </Link>
      </div>
      <p className="text-sm text-zinc-500 mb-8">
        Animations installed from <code className="font-mono bg-zinc-100 px-1 rounded">plugins/animations/</code>.
        Click &ldquo;Scan plugins/&rdquo; to detect and install new plugins from the filesystem.
      </p>

      <div className="mb-6">
        <ScanButton />
      </div>

      {plugins.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
          <p className="text-zinc-400 text-sm mb-2">No plugins installed yet.</p>
          <p className="text-zinc-400 text-xs">
            Add a directory to <code className="font-mono">plugins/animations/</code> with a{" "}
            <code className="font-mono">manifest.json</code> and click &ldquo;Scan plugins/&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plugins.map((plugin) => {
            const meta = (plugin.pluginMeta ?? {}) as Record<string, unknown>;
            const version = typeof meta.version === "string" ? meta.version : null;
            const description = typeof meta.description === "string" ? meta.description : null;
            const author = typeof meta.author === "string" ? meta.author : null;
            const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
            return (
              <div
                key={plugin.id}
                className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900">{plugin.name}</p>
                    <p className="text-xs text-zinc-400 font-mono">{plugin.slug}</p>
                  </div>
                  {version && (
                    <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full shrink-0">
                      v{version}
                    </span>
                  )}
                </div>

                {description && (
                  <p className="text-sm text-zinc-600">{description}</p>
                )}

                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-zinc-50 border border-zinc-200 text-zinc-500 px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {author && (
                  <p className="text-xs text-zinc-400">by {author}</p>
                )}

                <div className="flex items-center gap-4 pt-1 border-t border-zinc-100">
                  <Link
                    href={`/animations/${plugin.slug}`}
                    className="text-xs text-zinc-400 hover:text-zinc-700"
                  >
                    Preview
                  </Link>
                  <Link
                    href={`/admin/animations/${plugin.slug}`}
                    className="text-xs text-zinc-400 hover:text-zinc-700"
                  >
                    Edit
                  </Link>
                  <UninstallButton slug={plugin.slug} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
