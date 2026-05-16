import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { articles, articleCategories, categories } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateArticle } from "../../actions";
import ArticleEditorPanel from "@/components/ArticleEditorPanel";
import { parseFrontmatter } from "@/lib/frontmatter";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ publisher: string; slug: string }>;
}) {
  const { publisher: publisherSlug, slug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}/articles/${slug}`);
  }

  const [article] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!article) notFound();

  const { metadata: initialMetadata } = parseFrontmatter(article.content ?? "");

  const articleCats = await db
    .select({ slug: categories.slug })
    .from(articleCategories)
    .innerJoin(categories, eq(articleCategories.categoryId, categories.id))
    .where(eq(articleCategories.articleId, article.id));
  const currentCategories = articleCats.map((c) => c.slug).join(", ");

  // Wrap to strip the error-return value so TypeScript sees void for the form action prop.
  async function action(formData: FormData): Promise<void> {
    "use server";
    await updateArticle(publisherSlug, null, formData);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-6">Edit article</h1>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={article.id} />
        <div>
          <label htmlFor="title" className="block text-sm font-medium themed-secondary mb-1">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            defaultValue={article.title}
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            defaultValue={article.slug}
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="summary" className="block text-sm font-medium themed-secondary mb-1">
            Summary
          </label>
          <textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={500}
            defaultValue={article.summary ?? ""}
            className="themed-input w-full resize-y"
          />
        </div>
        <div>
          <label htmlFor="editNote" className="block text-sm font-medium themed-secondary mb-1">
            Edit note
          </label>
          <input
            id="editNote"
            name="editNote"
            type="text"
            defaultValue="Updated"
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="categories" className="block text-sm font-medium themed-secondary mb-1">
            Categories (comma-separated slugs)
          </label>
          <input
            id="categories"
            name="categories"
            type="text"
            defaultValue={currentCategories}
            className="themed-input"
          />
        </div>
        <ArticleEditorPanel publisherSlug={publisherSlug} initial={article.content ?? ""} initialMetadata={initialMetadata} />
        <button type="submit" className="themed-btn-primary">
          Save changes
        </button>
      </form>
    </main>
  );
}
