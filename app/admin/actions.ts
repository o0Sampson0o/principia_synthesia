"use server";

import { db } from "@/db";
import { articles, revisions, curriculumEntries, categories, articleCategories, savedAnimations, bookSnapshots, bookSnapshotEntries } from "@/db/schema";
import { eq, asc, inArray, ilike } from "drizzle-orm";
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

/**
 * Creates a new article and sets its categories, then redirects to the new
 * article's public page. Input is validated with `createArticleSchema`.
 * Categories (comma-separated slugs) are auto-created if they don't exist.
 * Revalidates the homepage cache on success.
 */
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

/**
 * Updates an existing article's content, title, slug, and categories.
 * Before writing the new content, the current content is saved as a revision
 * so it can be restored later. Validation errors are returned as a field-error
 * map rather than thrown, making them suitable for use with `useFormState`.
 * On success, revalidates the article's public page and redirects there.
 */
export async function updateArticle(prevState: any, formData: FormData) {
  const id = Number(formData.get("id"));
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const summary = formData.get("summary") as string;
  const content = formData.get("content") as string;
  const editNote = (formData.get("editNote") as string) || "Updated";
  const categoriesStr = (formData.get("categories") as string) || "";

  let validated: any;
  try {
    validated = updateArticleSchema.parse({ id, title, slug, summary, content, categories: categoriesStr });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const field = issue.path.join(".");
        fieldErrors[field] = issue.message;
      }
      return { error: fieldErrors };
    }
    throw err;
  }

  if (!validated) return { error: { form: "Validation failed" } };

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

/**
 * Restores an article to a specific historical revision.
 * Saves the current content as a new revision (with note "Before restore")
 * before overwriting, so the restore itself is reversible.
 * Revalidates the article's public page and redirects there on success.
 * Throws if the revision or article is not found.
 */
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

/**
 * Permanently deletes an article along with all its revisions and curriculum
 * entries (cascade is handled manually here to be explicit). Revalidates the
 * homepage cache and redirects to `/` after deletion.
 */
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

/**
 * Adds an article to a book, or updates its position and part title if it is
 * already a member of that book. The book itself is implicitly created when the
 * first entry with a new `bookSlug` is inserted (there is no separate book
 * record). Revalidates the book's public page and the admin curriculum page.
 */
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

/**
 * Removes a single article from a book. If this is the last entry in the book,
 * the book is implicitly deleted. Revalidates the book's public page and the
 * admin curriculum page.
 */
export async function removeCurriculumEntry(formData: FormData) {
  const validated = removeCurriculumEntrySchema.parse({
    id: formData.get("id"),
    bookSlug: formData.get("bookSlug"),
  });

  await db.delete(curriculumEntries).where(eq(curriculumEntries.id, validated.id));

  revalidatePath("/curriculum/" + validated.bookSlug);
  revalidatePath("/admin/curriculum");
}

/**
 * Deletes an entire book by removing all `curriculumEntries` rows that share
 * the given `bookSlug`. The articles themselves are not affected. Revalidates
 * the book's public page and the admin curriculum page.
 */
export async function deleteCurriculumBook(formData: FormData) {
  const bookSlug = (formData.get("bookSlug") as string).trim();
  if (!bookSlug) return;

  await db.delete(curriculumEntries).where(eq(curriculumEntries.bookSlug, bookSlug));

  revalidatePath("/curriculum/" + bookSlug);
  revalidatePath("/admin/curriculum");
}

// --- Category actions ---

/**
 * Atomically replaces all category associations for an article.
 *
 * For each slug in `slugs`, the category is created if it does not already
 * exist (using the slug as the initial name). All existing links for the
 * article are deleted and replaced in a single transaction-like sequence.
 * Passing an empty array removes all categories from the article.
 *
 * Revalidates `/category` after every call. This function is called internally
 * by `createArticle` and `updateArticle` — it is also exported so it can be
 * called directly from other server actions.
 */
export async function setArticleCategories(articleId: number, slugs: string[]) {
  const cleanSlugs = slugs.map((s) => s.trim()).filter(Boolean)

  if (cleanSlugs.length === 0) {
    await db.delete(articleCategories).where(eq(articleCategories.articleId, articleId))
    revalidatePath("/category")
    return
  }

  // Fetch existing categories in one query
  const existing = await db
    .select()
    .from(categories)
    .where(inArray(categories.slug, cleanSlugs))

  const existingMap = new Map(existing.map((c) => [c.slug, c.id]))
  const toInsert = cleanSlugs.filter((s) => !existingMap.has(s))

  // Batch insert new categories
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(categories)
      .values(toInsert.map((slug) => ({ slug, name: slug })))
      .returning()
    for (const c of inserted) existingMap.set(c.slug, c.id)
  }

  const ids = cleanSlugs.map((s) => existingMap.get(s)!).filter(Boolean)

  // Replace all category links atomically
  await db.delete(articleCategories).where(eq(articleCategories.articleId, articleId))
  if (ids.length > 0) {
    await db.insert(articleCategories).values(ids.map((categoryId) => ({ articleId, categoryId })))
  }

  revalidatePath("/category")
}

// --- Animation actions ---

/**
 * Creates or updates a saved animation. If an animation with the given slug
 * already exists, its `name` and `code` are updated. Otherwise a new row is
 * inserted. Revalidates the admin animations list and the public animations list.
 * Silently returns early if any of `slug`, `name`, or `code` is empty.
 */
export async function saveAnimation(formData: FormData) {
  const slug = (formData.get("slug") as string).trim();
  const name = (formData.get("name") as string).trim();
  const code = (formData.get("code") as string).trim();

  if (!slug || !name || !code) return;

  const existing = await db
    .select()
    .from(savedAnimations)
    .where(eq(savedAnimations.slug, slug))
    .limit(1);

  if (existing[0]) {
    await db
      .update(savedAnimations)
      .set({ name, code })
      .where(eq(savedAnimations.id, existing[0].id));
  } else {
    await db.insert(savedAnimations).values({ slug, name, code });
  }

  revalidatePath("/admin/animations");
  revalidatePath("/animations");
}

/**
 * Deletes an animation by slug. Revalidates the admin animations list.
 * Silently returns early if `slug` is empty. Note: any iframes currently
 * embedding this animation will display a blank page after deletion.
 */
export async function deleteAnimation(formData: FormData) {
  const slug = (formData.get("slug") as string).trim();
  if (!slug) return;

  await db.delete(savedAnimations).where(eq(savedAnimations.slug, slug));

  revalidatePath("/admin/animations");
}

// --- Snapshot actions ---

/**
 * Captures the current curriculum structure of a book as a named snapshot.
 * Each entry's position, part title, article metadata, and optionally the
 * article content are stored in `bookSnapshotEntries`. Revalidates the
 * snapshots admin page on success.
 */
export async function snapshotBook(bookSlug: string, note?: string) {
  const entries = await db
    .select({
      articleId: curriculumEntries.articleId,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      articleContent: articles.content,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .orderBy(asc(curriculumEntries.position));

  if (entries.length === 0) throw new Error("Book not found");

  const bookTitleRow = await db
    .select({ bookTitle: curriculumEntries.bookTitle })
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .limit(1);

  const [snapshot] = await db
    .insert(bookSnapshots)
    .values({ bookSlug, bookTitle: bookTitleRow[0].bookTitle, note: note ?? null })
    .returning();

  await db.insert(bookSnapshotEntries).values(
    entries.map((e) => ({
      snapshotId: snapshot.id,
      articleId: e.articleId,
      articleSlug: e.articleSlug,
      articleTitle: e.articleTitle,
      articleContent: e.articleContent,
      position: e.position,
      partTitle: e.partTitle,
    }))
  );

  revalidatePath(`/admin/curriculum/${bookSlug}/snapshots`);
}

/**
 * Restores a book's curriculum to a previously saved snapshot. The current
 * entries are replaced by the snapshot's entry list. If `restoreContent` is
 * true, each article's content is also overwritten with the snapshot value.
 * Revalidates the curriculum admin page on success.
 */
export async function restoreBookSnapshot(snapshotId: number, restoreContent = false) {
  const entries = await db
    .select()
    .from(bookSnapshotEntries)
    .where(eq(bookSnapshotEntries.snapshotId, snapshotId))
    .orderBy(asc(bookSnapshotEntries.position));

  if (entries.length === 0) throw new Error("Snapshot not found or empty");

  const snapshot = await db
    .select()
    .from(bookSnapshots)
    .where(eq(bookSnapshots.id, snapshotId))
    .limit(1);

  if (!snapshot[0]) throw new Error("Snapshot not found");

  const { bookSlug, bookTitle } = snapshot[0];

  // Replace curriculum entries
  await db.delete(curriculumEntries).where(eq(curriculumEntries.bookSlug, bookSlug));
  await db.insert(curriculumEntries).values(
    entries.map((e) => ({
      bookSlug,
      bookTitle,
      articleId: e.articleId,
      position: e.position,
      partTitle: e.partTitle,
    }))
  );

  // Optionally restore article content
  if (restoreContent) {
    for (const e of entries) {
      if (e.articleContent != null) {
        await db
          .update(articles)
          .set({ content: e.articleContent })
          .where(eq(articles.id, e.articleId));
      }
    }
  }

  revalidatePath(`/admin/curriculum/${bookSlug}`);
  revalidatePath(`/curriculum/${bookSlug}`);
}

// --- Search ---

/**
 * Fuzzy-searches articles, books, and animations using case-insensitive ILIKE
 * queries. Returns up to 8 results per category. Used by the command palette.
 */
export async function searchAll(query: string) {
  const q = `%${query}%`;
  const [articleRows, bookRows, animationRows] = await Promise.all([
    db
      .select({ id: articles.id, slug: articles.slug, title: articles.title })
      .from(articles)
      .where(ilike(articles.title, q))
      .limit(8),
    db
      .selectDistinct({ bookSlug: curriculumEntries.bookSlug, bookTitle: curriculumEntries.bookTitle })
      .from(curriculumEntries)
      .where(ilike(curriculumEntries.bookTitle, q))
      .limit(8),
    db
      .select({ slug: savedAnimations.slug, name: savedAnimations.name })
      .from(savedAnimations)
      .where(ilike(savedAnimations.name, q))
      .limit(8),
  ]);
  return { articles: articleRows, books: bookRows, animations: animationRows };
}
