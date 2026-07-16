"use server";

import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { assertEditRights } from "@/app/[publisher]/articles/actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function restoreArticle(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);
  const id = Number(formData.get("id"));
  await db
    .update(articles)
    .set({ deletedAt: null })
    .where(and(eq(articles.id, id), eq(articles.ownerType, ownerType), eq(articles.ownerId, ownerId)));
  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/bin`);
  redirect(`/${publisherSlug}/bin`);
}

export async function permanentlyDeleteArticle(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);
  const id = Number(formData.get("id"));
  await db
    .delete(articles)
    .where(
      and(
        eq(articles.id, id),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNotNull(articles.deletedAt)
      )
    );
  revalidatePath(`/${publisherSlug}/bin`);
  redirect(`/${publisherSlug}/bin`);
}

export async function restoreBook(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);
  const id = Number(formData.get("id"));
  await db
    .update(books)
    .set({ deletedAt: null })
    .where(and(eq(books.id, id), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)));
  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/bin`);
  redirect(`/${publisherSlug}/bin`);
}

// The old hard delete lives here now: FK cascades remove curriculumEntries,
// bookSnapshots, pdfCaches and internal articles along with the book row.
export async function permanentlyDeleteBook(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);
  const id = Number(formData.get("id"));
  await db
    .delete(books)
    .where(
      and(
        eq(books.id, id),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNotNull(books.deletedAt)
      )
    );
  revalidatePath(`/${publisherSlug}/bin`);
  redirect(`/${publisherSlug}/bin`);
}
