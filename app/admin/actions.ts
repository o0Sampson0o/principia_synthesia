"use server";

import { db } from "@/db";
import { articles, revisions, curriculumEntries, categories, articleCategories } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createArticleSchema,
  updateArticleSchema,
  deleteArticleSchema,
  upsertCurriculumEntrySchema,
  removeCurriculumEntrySchema,
  restoreRevisionSchema,
} from "@/lib/validations";

export async function createArticle(formData: FormData) {
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;
  const categoriesStr = (formData.get("categories") as string) || "";

  const validated = createArticleSchema.parse({ title, slug, summary, content, categories: categoriesStr });
  const categorySlugs = validated.categories?.split(",").filter(Boolean) || [];

  const [article] = await db.insert(articles).values({
    title: validated.title,
    slug: validated.slug,
    summary: validated.summary,
    content: validated.content,
  }).returning();

  await setArticleCategories(article.id, categorySlugs);

  revalidatePath("/");
  redirect(`/${validated.slug}`);
}

export async function updateArticle(formData: FormData) {
  const id = Number(formData.get("id"));
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;
  const editNote = (formData.get("editNote") as string) || "Updated";
  const categoriesStr = (formData.get("categories") as string) || "";

  const validated = updateArticleSchema.parse({ id, title, slug, summary, content, categories: categoriesStr });
  const categorySlugs = validated.categories?.split(",").filter(Boolean) || [];

  // Save revision first
  const current = await db
    .select()
    .from(articles)
    .where(eq(articles.id, validated.id))
    .limit(1);
  if (current[0]?.content) {
    await db.insert(revisions).values({
      articleId: validated.id,
      content: current[0].content,
      editNote: editNote,
    });
  }

  await db
    .update(articles)
    .set({
      title: validated.title,
      slug: validated.slug,
      summary: validated.summary,
      content: validated.content,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, validated.id));

  await setArticleCategories(validated.id, categorySlugs);

  revalidatePath(`/${validated.slug}`);
  redirect(`/${validated.slug}`);
}

export async function restoreRevision(formData: FormData) {
  const validated = restoreRevisionSchema.parse({
    revisionId: formData.get("revisionId"),
    articleId: formData.get("articleId"),
  });

  // Get the revision
  const revision = await db
    .select()
    .from(revisions)
    .where(eq(revisions.id, validated.revisionId))
    .limit(1);

  if (!revision[0]) {
    throw new Error("Revision not found");
  }

  // Get current article for slug
  const article = await db
    .select()
    .from(articles)
    .where(eq(articles.id, validated.articleId))
    .limit(1);

  if (!article[0]) {
    throw new Error("Article not found");
  }

  // Save current content as a revision before restoring
  await db.insert(revisions).values({
    articleId: validated.articleId,
    content: article[0].content || "",
    editNote: "Before restore",
  });

  // Restore the old content
  await db
    .update(articles)
    .set({ content: revision[0].content, updatedAt: new Date() })
    .where(eq(articles.id, validated.articleId));

  revalidatePath(`/${article[0].slug}`);
  redirect(`/${article[0].slug}`);
}

export async function deleteArticle(formData: FormData) {
  const validated = deleteArticleSchema.parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
  });

  await db.delete(revisions).where(eq(revisions.articleId, validated.id));
  await db.delete(curriculumEntries).where(eq(curriculumEntries.articleId, validated.id));
  await db.delete(articles).where(eq(articles.id, validated.id));

  revalidatePath("/");
  redirect("/");
}

// --- Curriculum actions ---

export async function upsertCurriculumEntry(formData: FormData) {
  const validated = upsertCurriculumEntrySchema.parse({
    bookSlug: formData.get("bookSlug"),
    bookTitle: formData.get("bookTitle"),
    articleId: formData.get("articleId"),
    position: formData.get("position"),
    partTitle: formData.get("partTitle"),
  });

  // Check if entry exists
  const existing = await db
    .select()
    .from(curriculumEntries)
    .where(eq(curriculumEntries.articleId, validated.articleId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(curriculumEntries)
      .set({
        bookSlug: validated.bookSlug,
        bookTitle: validated.bookTitle,
        position: validated.position,
        partTitle: validated.partTitle,
      })
      .where(eq(curriculumEntries.id, existing[0].id));
  } else {
    await db
      .insert(curriculumEntries)
      .values({
        bookSlug: validated.bookSlug,
        bookTitle: validated.bookTitle,
        articleId: validated.articleId,
        position: validated.position,
        partTitle: validated.partTitle,
      });
  }

  revalidatePath("/curriculum/" + validated.bookSlug);
  revalidatePath("/admin/curriculum");
}

export async function removeCurriculumEntry(formData: FormData) {
  const validated = removeCurriculumEntrySchema.parse({
    id: formData.get("id"),
    bookSlug: formData.get("bookSlug"),
  });

  await db.delete(curriculumEntries).where(eq(curriculumEntries.id, validated.id));

  revalidatePath("/curriculum/" + validated.bookSlug);
  revalidatePath("/admin/curriculum");
}

export async function deleteCurriculumBook(formData: FormData) {
  const bookSlug = (formData.get("bookSlug") as string).trim();
  if (!bookSlug) return;

  await db.delete(curriculumEntries).where(eq(curriculumEntries.bookSlug, bookSlug));

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
