"use server";

import { db } from "@/db";
import {
  articles,
  revisions,
  categories,
  articleCategories,
  publishers,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { parseFrontmatter } from "@/lib/frontmatter";
import {
  createArticleSchema,
  updateArticleSchema,
  deleteArticleSchema,
  restoreRevisionSchema,
} from "@/lib/validations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolvePublisherOrThrow(publisherSlug: string) {
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  return pub;
}

async function assertEditRights(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisherOrThrow(publisherSlug);
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  if (!(await canEditContent(session, ownerType, ownerId))) {
    throw new Error("Forbidden");
  }
  return { session, pub, ownerType: ownerType as "user" | "org", ownerId };
}

async function setArticleCategories(articleId: number, slugs: string[]) {
  if (slugs.length > 0) {
    for (const slug of slugs) {
      const existing = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);
      if (!existing[0]) {
        await db.insert(categories).values({ slug, name: slug });
      }
    }
  }
  await db.delete(articleCategories).where(eq(articleCategories.articleId, articleId));
  if (slugs.length > 0) {
    const cats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.slug, slugs));
    if (cats.length > 0) {
      await db.insert(articleCategories).values(
        cats.map((c) => ({ articleId, categoryId: c.id }))
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createArticle(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const validated = createArticleSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    categories: formData.get("categories"),
  });

  const categorySlugs = validated.categories?.split(",").filter(Boolean) ?? [];
  const parsed = parseFrontmatter(validated.content ?? "");

  const [article] = await db
    .insert(articles)
    .values({
      title: validated.title,
      slug: validated.slug,
      summary: validated.summary,
      content: validated.content,
      ownerType,
      ownerId,
      metadata: parsed.metadata,
    })
    .returning({ id: articles.id });

  await setArticleCategories(article.id, categorySlugs);

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}/articles/${validated.slug}`);
}

export async function updateArticle(
  publisherSlug: string,
  prevState: unknown,
  formData: FormData
) {
  await assertEditRights(publisherSlug);

  let validated: ReturnType<typeof updateArticleSchema.parse>;
  try {
    // formData.get() returns null for missing fields; convert to undefined
    // so z.string().optional() accepts them.
    validated = updateArticleSchema.parse({
      id: formData.get("id"),
      title: formData.get("title"),
      slug: formData.get("slug"),
      summary: formData.get("summary") ?? undefined,
      content: formData.get("content") ?? undefined,
      categories: formData.get("categories") ?? undefined,
    });
  } catch (err: unknown) {
    const zodErr = err as { name?: string; issues?: { path: string[]; message: string }[] };
    if (zodErr?.name === "ZodError" && zodErr.issues) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of zodErr.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return { error: fieldErrors };
    }
    throw err;
  }

  const categorySlugs = validated.categories?.split(",").filter(Boolean) ?? [];
  const parsedFm = parseFrontmatter(validated.content ?? "");

  const [current] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, validated.id))
    .limit(1);

  if (current?.content) {
    await db.insert(revisions).values({
      articleId: validated.id,
      content: current.content,
      editNote: (formData.get("editNote") as string) || "Updated",
    });
  }

  await db
    .update(articles)
    .set({
      title: validated.title,
      slug: validated.slug,
      summary: validated.summary,
      content: validated.content,
      metadata: parsedFm.metadata,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, validated.id));

  await setArticleCategories(validated.id, categorySlugs);

  if (current?.isInternal && current?.parentBookId) {
    // Find the book slug for the redirect
    const { books } = await import("@/db/schema");
    const [bookRow] = await db
      .select({ slug: books.slug })
      .from(books)
      .where(eq(books.id, current.parentBookId))
      .limit(1);
    if (bookRow) {
      revalidatePath(`/${publisherSlug}/books/${bookRow.slug}/${validated.slug}`);
      redirect(`/${publisherSlug}/books/${bookRow.slug}/${validated.slug}`);
    }
  }

  revalidatePath(`/${publisherSlug}/articles/${validated.slug}`);
  redirect(`/${publisherSlug}/articles/${validated.slug}`);
}

export async function deleteArticle(publisherSlug: string, formData: FormData) {
  await assertEditRights(publisherSlug);

  const validated = deleteArticleSchema.parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
  });

  const [article] = await db
    .select({ isInternal: articles.isInternal, parentBookId: articles.parentBookId })
    .from(articles)
    .where(eq(articles.id, validated.id))
    .limit(1);

  await db.delete(articles).where(eq(articles.id, validated.id));

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  redirect(`/${publisherSlug}`);
}

export async function restoreRevision(publisherSlug: string, formData: FormData) {
  await assertEditRights(publisherSlug);

  const validated = restoreRevisionSchema.parse({
    revisionId: formData.get("revisionId"),
    articleId: formData.get("articleId"),
  });

  const [revision] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.id, validated.revisionId))
    .limit(1);
  if (!revision) throw new Error("Revision not found");

  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, validated.articleId))
    .limit(1);
  if (!article) throw new Error("Article not found");

  await db.insert(revisions).values({
    articleId: validated.articleId,
    content: article.content || "",
    editNote: "Before restore",
  });

  const restoredFm = parseFrontmatter(revision.content ?? "");
  await db
    .update(articles)
    .set({ content: revision.content, metadata: restoredFm.metadata, updatedAt: new Date() })
    .where(eq(articles.id, validated.articleId));

  if (article.isInternal && article.parentBookId) {
    const { books } = await import("@/db/schema");
    const [bookRow] = await db
      .select({ slug: books.slug })
      .from(books)
      .where(eq(books.id, article.parentBookId))
      .limit(1);
    if (bookRow) {
      revalidatePath(`/${publisherSlug}/books/${bookRow.slug}/${article.slug}`);
      redirect(`/${publisherSlug}/books/${bookRow.slug}/${article.slug}`);
    }
  }

  revalidatePath(`/${publisherSlug}/articles/${article.slug}`);
  redirect(`/${publisherSlug}/articles/${article.slug}`);
}

export async function updateArticleContent(
  publisherSlug: string,
  slug: string,
  content: string
) {
  await assertEditRights(publisherSlug);

  const { parseFrontmatter } = await import("@/lib/frontmatter");
  const parsed = parseFrontmatter(content);

  await db
    .update(articles)
    .set({ content, metadata: parsed.metadata, updatedAt: new Date() })
    .where(eq(articles.slug, slug));

  revalidatePath(`/${publisherSlug}/articles/${slug}`);
  revalidatePath(`/${publisherSlug}/articles/${slug}/edit`);
}
