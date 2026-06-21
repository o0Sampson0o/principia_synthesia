import { db } from "@/db";
import { categories, articleCategories, bookCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Atomically replaces all tag/category associations for an article or book.
 * Upserts any unknown slugs as user-created categories, then rebuilds the join rows.
 * Wrapped in a transaction so a failed INSERT never leaves the resource tag-less.
 */
export async function setContentTags(
  type: "article" | "book",
  resourceId: number,
  slugs: string[],
  createdByUserId: number
) {
  await db.transaction(async (tx) => {
    if (type === "article") {
      await tx.delete(articleCategories).where(eq(articleCategories.articleId, resourceId));
    } else {
      await tx.delete(bookCategories).where(eq(bookCategories.bookId, resourceId));
    }

    if (slugs.length === 0) return;

    for (const slug of slugs) {
      await tx.insert(categories).values({ slug, name: slug, createdByUserId }).onConflictDoNothing();
    }

    const cats = await tx.select({ id: categories.id }).from(categories).where(inArray(categories.slug, slugs));
    if (cats.length === 0) return;

    if (type === "article") {
      await tx.insert(articleCategories).values(cats.map((c) => ({ articleId: resourceId, categoryId: c.id })));
    } else {
      await tx.insert(bookCategories).values(cats.map((c) => ({ bookId: resourceId, categoryId: c.id })));
    }
  });
}
