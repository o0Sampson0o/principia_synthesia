import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { deleteKaoObject, cloneKaoObject } from "../actions";
import EditKaoForm from "./EditKaoForm";
import type { KaoContent, AnimationContent, DatasetContent, DiagramContent } from "@/lib/kao";
import { isAnimationContent, isDatasetContent, isDiagramContent } from "@/lib/kao";
import { canViewPluginCode, canClonePlugin } from "@/lib/plugin-license";

export default async function ObjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const rows = await db.select().from(objects).where(eq(objects.slug, slug)).limit(1);
  if (!rows[0]) notFound();

  const obj = rows[0];
  const content = obj.content as KaoContent;

  const isPlugin = obj.source === "plugin";
  const pluginMeta = isPlugin ? (obj.pluginMeta as Record<string, unknown> | null) : null;
  const license = typeof pluginMeta?.license === "string" ? pluginMeta.license : null;
  const codeVisible = isPlugin ? canViewPluginCode(license) : true;
  const cloneable = isPlugin ? canClonePlugin(license) : false;

  if (isPlugin) {
    const version = typeof pluginMeta?.version === "string" ? pluginMeta.version : null;
    const author = typeof pluginMeta?.author === "string" ? pluginMeta.author : null;
    const description = typeof pluginMeta?.description === "string" ? pluginMeta.description : null;
    const tags = Array.isArray(pluginMeta?.tags) ? (pluginMeta.tags as string[]) : [];

    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500 mb-8">
          <Link href="/admin" className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/objects" className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
            Objects
          </Link>
          <span>/</span>
          <span className="text-zinc-700 dark:text-zinc-300">{obj.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{obj.name}</h1>
          <span className="text-xs font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 rounded-full">
            Plugin
          </span>
        </div>
        <div className="mb-8">
          <Link
            href="/admin/objects/plugins"
            className="text-sm text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200 transition-colors"
          >
            View in Plugin Gallery &rarr;
          </Link>
        </div>

        {/* Metadata */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm mb-8">
          <dt className="font-medium text-zinc-500 dark:text-zinc-400">Slug</dt>
          <dd className="font-mono text-zinc-800 dark:text-zinc-200">{obj.slug}</dd>

          <dt className="font-medium text-zinc-500 dark:text-zinc-400">Type</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{obj.type}</dd>

          <dt className="font-medium text-zinc-500 dark:text-zinc-400">License</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {license ?? <span className="text-zinc-400 italic">Not specified</span>}
          </dd>

          {version && (
            <>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Version</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{version}</dd>
            </>
          )}

          {author && (
            <>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Author</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{author}</dd>
            </>
          )}

          {description && (
            <>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Description</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{description}</dd>
            </>
          )}

          {tags.length > 0 && (
            <>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        {/* Source code */}
        {isAnimationContent(content) && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Source code</h2>
            {codeVisible ? (
              <pre className="bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 text-sm overflow-x-auto">
                <code>{(content as AnimationContent).code}</code>
              </pre>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
                Source code is not available &mdash; this plugin&apos;s license does not permit viewing the source.
              </p>
            )}
          </div>
        )}

        {/* Clone */}
        {cloneable && (
          <div className="mb-8">
            <form action={cloneKaoObject}>
              <input type="hidden" name="slug" value={obj.slug} />
              <button
                type="submit"
                className="text-sm bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
              >
                Clone to editable copy
              </button>
            </form>
          </div>
        )}

        {/* Preview */}
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-4">Preview</h2>
          {isAnimationContent(content) && (
            <iframe
              src={`/api/objects/${obj.slug}/preview`}
              className="w-full h-64 border rounded border-zinc-200 dark:border-zinc-700"
            />
          )}
          {isDatasetContent(content) && (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse w-full">
                <thead>
                  <tr>
                    {(content as DatasetContent).headers.map((h, i) => (
                      <th
                        key={i}
                        className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-left font-semibold bg-zinc-50 dark:bg-zinc-800"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(content as DatasetContent).rows.map((row, i) => (
                    <tr key={i}>
                      {(row as unknown[]).map((cell, j) => (
                        <td
                          key={j}
                          className="border border-zinc-200 dark:border-zinc-700 px-3 py-2"
                        >
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isDiagramContent(content) && (
            <pre className="bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 text-sm overflow-x-auto">
              <code>{(content as DiagramContent).source}</code>
            </pre>
          )}
        </div>
      </main>
    );
  }

  // Non-plugin: existing layout
  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500 mb-8">
        <Link href="/admin" className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          Admin
        </Link>
        <span>/</span>
        <Link href="/admin/objects" className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          Objects
        </Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-300">{obj.name}</span>
      </nav>

      {/* Delete form */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{obj.name}</h1>
        <form action={deleteKaoObject}>
          <input type="hidden" name="id" value={obj.id} />
          <input type="hidden" name="slug" value={obj.slug} />
          <button
            type="submit"
            className="text-sm text-red-500 hover:text-red-600 transition-colors"
            onClick={(e) => {
              if (!confirm(`Delete "${obj.name}"? This cannot be undone.`)) e.preventDefault();
            }}
          >
            Delete
          </button>
        </form>
      </div>

      {/* Edit form */}
      <EditKaoForm object={obj} />

      {/* Preview */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold mb-4">Preview</h2>
        {isAnimationContent(content) && (
          <iframe
            src={`/api/objects/${obj.slug}/preview`}
            className="w-full h-64 border rounded border-zinc-200 dark:border-zinc-700"
          />
        )}
        {isDatasetContent(content) && (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  {(content as DatasetContent).headers.map((h, i) => (
                    <th
                      key={i}
                      className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-left font-semibold bg-zinc-50 dark:bg-zinc-800"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(content as DatasetContent).rows.map((row, i) => (
                  <tr key={i}>
                    {(row as unknown[]).map((cell, j) => (
                      <td
                        key={j}
                        className="border border-zinc-200 dark:border-zinc-700 px-3 py-2"
                      >
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isDiagramContent(content) && (
          <pre className="bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 text-sm overflow-x-auto">
            <code>{(content as DiagramContent).source}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
