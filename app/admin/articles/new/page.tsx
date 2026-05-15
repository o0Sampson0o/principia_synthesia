import { createArticle } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";
import CategoryInput from "@/components/CategoryInput";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import FrontmatterEditor from "@/app/admin/articles/FrontmatterEditor";

export default async function NewArticlePage() {
  const canvasObjects = await db
    .select({ slug: objects.slug, name: objects.name })
    .from(objects)
    .where(eq(objects.type, "animation"))
    .orderBy(asc(objects.name));

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-8">New Article</h1>
      <form action={createArticle} className="space-y-4">
        <input name="title" placeholder="Title" required className="themed-input" />
        <input name="slug" placeholder="slug-like-this" required className="themed-input" />
        <input name="summary" placeholder="Short summary" className="themed-input" />
        <CategoryInput initial={[]} />
        <ContentEditor initial="" />
      </form>

      <details className="border border-zinc-200 dark:border-zinc-800 rounded-lg mt-8">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors select-none">
          Frontmatter / metadata
        </summary>
        <div className="px-4 pb-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <FrontmatterEditor
            initialContent=""
            availableCanvasSlugs={canvasObjects}
          />
        </div>
      </details>
    </main>
  );
}
