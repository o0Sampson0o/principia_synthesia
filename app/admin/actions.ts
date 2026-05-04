"use server";

import { db } from "@/db";
import { articles, revisions, curriculumEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createArticle(formData: FormData) {
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;

  await db.insert(articles).values({ title, slug, summary, content });

  revalidatePath("/");
  redirect(`/${slug}`);
}

export async function updateArticle(formData: FormData) {
  console.log("content received:", formData.get("content"));
  console.log("id received:", formData.get("id"));
  // rest of the function...
  const id = Number(formData.get("id"));
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;

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
