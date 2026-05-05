import { createArticle } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";
import CategoryInput from "@/components/CategoryInput";

export default function NewArticlePage() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-8">
        New Article
      </h1>
      <form action={createArticle} className="space-y-4">
        <input
          name="title"
          placeholder="Title"
          required
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
        <input
          name="slug"
          placeholder="slug-like-this"
          required
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
        <input
          name="summary"
          placeholder="Short summary"
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
        <CategoryInput initial={[]} />
        <ContentEditor initial="" />
      </form>
    </main>
  );
}
