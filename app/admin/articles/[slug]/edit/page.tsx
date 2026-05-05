import { db } from "@/db";
import { articles, categories, articleCategories, revisions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateArticle, restoreRevision } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";
import CategoryInput from "@/components/CategoryInput";
import DeleteButton from "./DeleteButton";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await db
    .select()
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  if (!article[0]) notFound();

  const a = article[0];

  const existingCats = await db
    .select({ slug: categories.slug })
    .from(categories)
    .innerJoin(articleCategories, eq(categories.id, articleCategories.categoryId))
    .where(eq(articleCategories.articleId, a.id));

  const revisionList = await db
    .select()
    .from(revisions)
    .where(eq(revisions.articleId, a.id))
    .orderBy(desc(revisions.editedAt));

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Edit: {a.title}</h1>
        <DeleteButton id={a.id} slug={a.slug} title={a.title} />
      </div>

      {/* Edit Form */}
      <form action={updateArticle} className="space-y-4 mb-12">
        <input type="hidden" name="id" value={a.id} />
        <input
          name="title"
          defaultValue={a.title}
          required
          className="w-full border rounded px-4 py-2"
        />
        <input
          name="slug"
          defaultValue={a.slug}
          required
          className="w-full border rounded px-4 py-2"
        />
        <input
          name="summary"
          defaultValue={a.summary || ""}
          className="w-full border rounded px-4 py-2"
        />
        <input
          name="editNote"
          placeholder="Edit note (optional)"
          className="w-full border rounded px-4 py-2 text-sm"
        />
        <CategoryInput initial={existingCats.map((c) => c.slug)} />
        <ContentEditor initial={a.content || ""} />
      </form>

      {/* Revisions */}
      {revisionList.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Revision History</h2>
          <div className="space-y-4">
            {revisionList.map((rev) => (
              <details
                key={rev.id}
                className="border border-zinc-200 dark:border-zinc-800 rounded-lg"
              >
                <summary className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {rev.editedAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {rev.editNote}
                    </span>
                  </div>
                  <form action={restoreRevision} className="inline">
                    <input type="hidden" name="revisionId" value={rev.id} />
                    <input type="hidden" name="articleId" value={a.id} />
                    <button
                      type="submit"
                      className="text-xs px-3 py-1 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      onClick={(e) => {
                        if (!confirm("Restore this revision? Current content will be saved as a revision.")) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Restore
                    </button>
                  </form>
                </summary>
                <div className="px-4 pb-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="mt-4 prose prose-sm max-w-none dark:prose-invert">
                    <MDXRemote
                      source={rev.content || ""}
                      options={{
                        mdxOptions: {
                          remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
                          rehypePlugins: [rehypeKatex],
                        },
                      }}
                    />
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
