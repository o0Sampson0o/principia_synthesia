import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import SearchParamToast from "@/components/SearchParamToast";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createArticle } from "../actions";
import ArticleEditorPanel from "@/components/ArticleEditorPanel";
import CategoryPicker from "@/components/CategoryPicker";
import { DEFAULT_ARTICLE_METADATA } from "@/lib/frontmatter";

export default async function NewArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ publisher: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ publisher: publisherSlug }, { error }] = await Promise.all([params, searchParams]);
  const errorMessage =
    error === "slug_taken"
      ? "An article with this slug already exists (it may be in the bin). Pick a different slug."
      : null;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
  }

  const action = createArticle.bind(null, publisherSlug);

  return (
    <main className="w-full max-w-7xl mx-auto px-5 py-10 sm:py-14">

      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Article</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          New article
        </h1>
      </div>

      <SearchParamToast message={errorMessage} />

      <form action={action} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="title" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Title
            </label>
            <input id="title" name="title" type="text" required maxLength={200} className="themed-input" />
          </div>
          <div>
            <label htmlFor="slug" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Slug
            </label>
            <div className="flex items-center gap-1.5">
              <span className="themed-muted shrink-0" style={{ fontSize: "0.875rem" }}>article-</span>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                placeholder="my-article"
                className="themed-input flex-1"
                pattern="^article-[a-z0-9]+(?:-[a-z0-9]+)*$"
              />
            </div>
            <p className="themed-muted mt-1.5" style={{ fontSize: "0.75rem" }}>Must start with &ldquo;article-&rdquo;.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="summary" className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
              Summary
            </label>
            <textarea id="summary" name="summary" rows={2} maxLength={500} className="themed-input w-full resize-y" />
          </div>
        </div>

        <ArticleEditorPanel publisherSlug={publisherSlug} draftKey={`${publisherSlug}:new`} initialMetadata={DEFAULT_ARTICLE_METADATA} />

        <div>
          <label className="block font-medium mb-1.5 themed-secondary" style={{ fontSize: "0.75rem" }}>
            Tags
          </label>
          <CategoryPicker />
        </div>

        <button
          type="submit"
          className="themed-btn-accent rounded-lg"
          style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}
        >
          Publish article
        </button>
      </form>

    </main>
  );
}
