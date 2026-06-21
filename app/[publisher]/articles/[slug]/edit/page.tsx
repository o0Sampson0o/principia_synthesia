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
    <main className="max-w-7xl mx-auto px-5 py-10 sm:py-14">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="ps-eyebrow mb-1.5">Article</p>
          <h1
            className="ps-display themed-heading"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}
          >
            Edit article
          </h1>
        </div>
        <Link
          href={`/${publisherSlug}/articles/${slug}/access`}
          data-tour="article-access-link"
          className="themed-btn-outline"
          style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
        >
          Access &amp; visibility
        </Link>
      </div>

      {/* ── Draft banner ── */}
      {hasDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border themed-border themed-surface px-4 py-3">
          <span className="themed-secondary" style={{ fontSize: "0.875rem" }}>
            Editing an <strong className="themed-heading">unsaved draft</strong>
            {article.draftSavedAt ? ` · saved ${article.draftSavedAt.toLocaleString()}` : ""}.
            Visitors see the published version until you save.
          </span>
          <form action={discardDraftAction}>
            <button type="submit" className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              Discard draft
            </button>
          </form>
        </div>
      )}

      <form action={action} className="space-y-5">
        <input type="hidden" name="id" value={article.id} />

        {/* ── Meta fields ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="title" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Title
            </label>
            <input id="title" name="title" type="text" required maxLength={200} defaultValue={article.title} className="themed-input" />
          </div>
          <div>
            <label htmlFor="slug" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Slug
            </label>
            <input id="slug" name="slug" type="text" required defaultValue={article.slug} className="themed-input" />
          </div>
          <div>
            <label htmlFor="summary" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Summary
            </label>
            <textarea id="summary" name="summary" rows={2} maxLength={500} defaultValue={article.summary ?? ""} className="themed-input w-full resize-y" />
          </div>
          <div>
            <label htmlFor="editNote" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Edit note
            </label>
            <input id="editNote" name="editNote" type="text" defaultValue="Updated" className="themed-input" />
          </div>
        </div>

        <div>
          <label className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
            Categories
          </label>
          <CategoryPicker initialSelected={currentCategories ? currentCategories.split(",").filter(Boolean) : []} />
        </div>

        {/* ── Editor ── */}
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

        <button
          type="submit"
          className="themed-btn-accent rounded-lg"
          style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}
        >
          Save changes
        </button>
      </form>

      {/* ── Danger zone ── */}
      <div className="mt-14 pt-6 border-t themed-border">
        <p className="ps-eyebrow mb-3" style={{ color: "var(--color-error)" }}>Danger zone</p>
        <DeleteArticleButton
          publisherSlug={publisherSlug}
          articleId={article.id}
          articleSlug={article.slug}
        />
      </div>

    </main>
  );
}
