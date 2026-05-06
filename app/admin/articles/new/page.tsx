import { createArticle } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";
import CategoryInput from "@/components/CategoryInput";

export default function NewArticlePage() {
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
    </main>
  );
}
