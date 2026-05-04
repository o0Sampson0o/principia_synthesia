import { createArticle } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";

export default function NewArticlePage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">New Article</h1>
      <form action={createArticle} className="space-y-4">
        <input
          name="title"
          placeholder="Title"
          required
          className="w-full border rounded px-4 py-2"
        />
        <input
          name="slug"
          placeholder="slug-like-this"
          required
          className="w-full border rounded px-4 py-2"
        />
        <input
          name="summary"
          placeholder="Short summary"
          className="w-full border rounded px-4 py-2"
        />
        <ContentEditor initial="" />
      </form>
    </main>
  );
}
