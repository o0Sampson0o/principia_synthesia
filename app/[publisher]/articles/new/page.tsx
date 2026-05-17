import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createArticle } from "../actions";
import ArticleEditorPanel from "@/components/ArticleEditorPanel";
import { DEFAULT_ARTICLE_METADATA } from "@/lib/frontmatter";

export default async function NewArticlePage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

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
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-6">New article</h1>
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium themed-secondary mb-1">
            Title
          </label>
          <input id="title" name="title" type="text" required maxLength={200} className="themed-input" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
            Slug
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm themed-muted">article-</span>
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
          <p className="text-xs themed-muted mt-1">Must start with &ldquo;article-&rdquo;.</p>
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
            className="themed-input w-full resize-y"
          />
        </div>
        <ArticleEditorPanel publisherSlug={publisherSlug} initialMetadata={DEFAULT_ARTICLE_METADATA} />
        <div>
          <label htmlFor="categories" className="block text-sm font-medium themed-secondary mb-1">
            Categories (comma-separated slugs)
          </label>
          <input id="categories" name="categories" type="text" className="themed-input" />
        </div>
        <button type="submit" className="themed-btn-primary">
          Publish article
        </button>
      </form>
    </main>
  );
}
