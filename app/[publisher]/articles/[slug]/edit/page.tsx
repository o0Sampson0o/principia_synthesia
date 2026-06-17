import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { articles, articleCategories, categories, revisions } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { updateArticle, saveArticleDraft, discardArticleDraft } from "../../actions";
import DeleteArticleButton from "@/components/DeleteArticleButton";
import ArticleEditorPanel from "@/components/ArticleEditorPanel";
import CategoryPicker from "@/components/CategoryPicker";
import RevisionHistory from "@/components/RevisionHistory";
import { parseFrontmatter } from "@/lib/frontmatter";
import Link from "next/link";

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
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);

  if (!article) notFound();

  // When an unsaved draft exists, the editor opens on it; visitors still see
  // the published `content`.
  const hasDraft = article.draftContent != null;
  const editorInitial = article.draftContent ?? article.content ?? "";
  const { metadata: initialMetadata } = parseFrontmatter(editorInitial);

  const articleCats = await db
    .select({ slug: categories.slug })
    .from(articleCategories)
    .innerJoin(categories, eq(articleCategories.categoryId, categories.id))
    .where(eq(articleCategories.articleId, article.id));
  const currentCategories = articleCats.map((c) => c.slug).join(", ");

  async function action(formData: FormData): Promise<void> {
    "use server";
    await updateArticle(publisherSlug, null, formData);
  }

  async function saveDraftAction(content: string): Promise<{ ok: true; savedAt: string }> {
    "use server";
    return saveArticleDraft(publisherSlug, slug, content);
  }

  async function discardDraftAction(): Promise<void> {
    "use server";
    await discardArticleDraft(publisherSlug, slug);
  }

  const articleRevisions = await db
    .select({ id: revisions.id, editNote: revisions.editNote, editedAt: revisions.editedAt })
    .from(revisions)
    .where(eq(revisions.articleId, article.id))
    .orderBy(desc(revisions.editedAt))
    .limit(20);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold themed-heading">Edit article</h1>
        <Link
          href={`/${publisherSlug}/articles/${slug}/access`}
          data-tour="article-access-link"
          className="themed-btn-ghost text-sm px-3 py-1"
        >
          Access &amp; visibility
        </Link>
      </div>
      {hasDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 px-4 py-3 text-sm">
          <span className="themed-secondary">
            You&rsquo;re editing an <strong>unsaved draft</strong>
            {article.draftSavedAt ? ` (saved ${article.draftSavedAt.toLocaleString()})` : ""}. Visitors still see the published version until you save changes.
          </span>
          <form action={discardDraftAction}>
            <button type="submit" className="themed-btn-ghost text-xs px-2 py-1">
              Discard draft
            </button>
          </form>
        </div>
      )}
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
          <label className="block text-sm font-medium themed-secondary mb-1">
            Categories
          </label>
          <CategoryPicker initialSelected={currentCategories ? currentCategories.split(",").filter(Boolean) : []} />
        </div>
        <ArticleEditorPanel
          publisherSlug={publisherSlug}
          draftKey={`${publisherSlug}:article-${article.id}`}
          initial={editorInitial}
          initialMetadata={initialMetadata}
          saveDraftAction={saveDraftAction}
          initialDraftSavedAt={article.draftSavedAt?.toISOString() ?? null}
        />
        <RevisionHistory
          publisherSlug={publisherSlug}
          articleId={article.id}
          revisions={articleRevisions}
        />
        <button type="submit" className="themed-btn-primary">
          Save changes
        </button>
      </form>

      <div className="mt-12 pt-6 border-t themed-border">
        <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Danger zone</h2>
        <DeleteArticleButton
          publisherSlug={publisherSlug}
          articleId={article.id}
          articleSlug={article.slug}
        />
      </div>
    </main>
  );
}
