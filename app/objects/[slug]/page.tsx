import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { KaoContent, DatasetContent, DiagramContent } from "@/lib/kao";
import { isAnimationContent, isDatasetContent, isDiagramContent } from "@/lib/kao";
import DiagramRenderer from "@/components/DiagramRenderer";
import DynamicAnimation from "@/components/DynamicAnimation";

const TYPE_BADGE: Record<string, string> = {
  animation: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  dataset: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  diagram: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

export default async function ObjectPage({
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
      <Link
        href="/objects"
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6 inline-block"
      >
        ← All objects
      </Link>

      <div className="flex items-start gap-3 mb-2">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
          {obj.name}
        </h1>
        <span
          className={`mt-2 text-xs px-2 py-0.5 rounded font-medium capitalize ${
            TYPE_BADGE[obj.type] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {obj.type}
        </span>
      </div>

      {obj.description && (
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">{obj.description}</p>
      )}

      <div className="mt-6">
        {isAnimationContent(content) && (
          <DynamicAnimation slug={obj.slug} />
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
          <DiagramRenderer
            format={(content as DiagramContent).format}
            source={(content as DiagramContent).source}
          />
        )}
      </div>
    </main>
  );
}
