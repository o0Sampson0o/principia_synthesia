import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { deleteKaoObject } from "../actions";
import EditKaoForm from "./EditKaoForm";
import type { KaoContent, AnimationContent, DatasetContent, DiagramContent } from "@/lib/kao";
import { isAnimationContent, isDatasetContent, isDiagramContent } from "@/lib/kao";

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
