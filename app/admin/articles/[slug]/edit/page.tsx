import { db } from "@/db";
import { articles, categories, articleCategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateArticle } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";
import CategoryInput from "@/components/CategoryInput";
import DeleteButton from "./DeleteButton";

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

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Edit: {a.title}</h1>
        <DeleteButton id={a.id} slug={a.slug} title={a.title} />
      </div>
      <form action={updateArticle} className="space-y-4">
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
        <CategoryInput initial={existingCats.map((c) => c.slug)} />
        <ContentEditor initial={a.content || ""} />
      </form>
    </main>
  );
}
