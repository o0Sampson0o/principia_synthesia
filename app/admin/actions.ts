"use server";

import { db } from "@/db";
import { articles, revisions, curriculumEntries, categories, articleCategories } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createArticle(formData: FormData) {
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;
  const categorySlugs = ((formData.get("categories") as string) || "").split(",").filter(Boolean)

  const [article] = await db.insert(articles).values({ title, slug, summary, content }).returning()
  await setArticleCategories(article.id, categorySlugs)

  revalidatePath("/");
  redirect(`/${slug}`);
}

export async function updateArticle(formData: FormData) {
  const id = Number(formData.get("id"));
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;
  const categorySlugs = ((formData.get("categories") as string) || "").split(",").filter(Boolean)

  // Save revision first
  const current = await db
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);
  if (current[0]?.content) {
    await db.insert(revisions).values({
      articleId: id,
      content: current[0].content,
      editNote: "Updated",
    });
  }

  await db
    .update(articles)
    .set({ title, slug, summary, content, updatedAt: new Date() })
    .where(eq(articles.id, id));

  await setArticleCategories(id, categorySlugs)

  revalidatePath(`/${slug}`);
  redirect(`/${slug}`);
}

export async function deleteArticle(formData: FormData) {
  const id = Number(formData.get("id"));
  const slug = formData.get("slug") as string;

  await db.delete(revisions).where(eq(revisions.articleId, id));
  await db.delete(curriculumEntries).where(eq(curriculumEntries.articleId, id));
  await db.delete(articles).where(eq(articles.id, id));

  revalidatePath("/");
  redirect("/");
}

// --- Curriculum actions ---

export async function upsertCurriculumEntry(formData: FormData) {
  const bookSlug = formData.get("bookSlug") as string;
  const bookTitle = formData.get("bookTitle") as string;
  const articleId = Number(formData.get("articleId"));
  const position = Number(formData.get("position"));
  const partTitle = (formData.get("partTitle") as string) || null;

  // Check if entry exists
  const existing = await db
    .select()
    .from(curriculumEntries)
    .where(eq(curriculumEntries.articleId, articleId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(curriculumEntries)
      .set({ bookSlug, bookTitle, position, partTitle })
      .where(eq(curriculumEntries.id, existing[0].id));
  } else {
    await db
      .insert(curriculumEntries)
      .values({ bookSlug, bookTitle, articleId, position, partTitle });
  }

  revalidatePath("/curriculum/" + bookSlug);
  revalidatePath("/admin/curriculum");
}

export async function removeCurriculumEntry(formData: FormData) {
  const id = Number(formData.get("id"));
  const bookSlug = formData.get("bookSlug") as string;

  await db.delete(curriculumEntries).where(eq(curriculumEntries.id, id));

  revalidatePath("/curriculum/" + bookSlug);
  revalidatePath("/admin/curriculum");
}

// --- Category actions ---

export async function setArticleCategories(articleId: number, slugs: string[]) {
  // Upsert each category by slug
  const ids: number[] = []
  for (const slug of slugs) {
    const name = slug.trim()
    if (!name) continue
    const existing = await db.select().from(categories).where(eq(categories.slug, name)).limit(1)
    let id: number
    if (existing[0]) {
      id = existing[0].id
    } else {
      const [inserted] = await db.insert(categories).values({ slug: name, name }).returning()
      id = inserted.id
    }
    ids.push(id)
  }

  // Replace all category links for this article
  await db.delete(articleCategories).where(eq(articleCategories.articleId, articleId))
  if (ids.length > 0) {
    await db.insert(articleCategories).values(ids.map((categoryId) => ({ articleId, categoryId })))
  }

  revalidatePath("/category")
}
