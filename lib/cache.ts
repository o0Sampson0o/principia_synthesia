import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { articles, curriculumEntries, savedAnimations, articleCategories } from "@/db/schema";
import { desc, asc, eq, ilike, or, count } from "drizzle-orm";

export const TAGS = {
  articles: "articles",
  article: (slug: string) => `article:${slug}`,
  curriculum: "curriculum",
  book: (slug: string) => `book:${slug}`,
  categories: "categories",
  animations: "animations",
} as const;

export const getRecentArticles = unstable_cache(
  async (limit: number) => {
    return db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .orderBy(desc(articles.updatedAt))
      .limit(limit);
  },
  ["recent-articles"],
  { tags: [TAGS.articles], revalidate: 3600 }
);

export const getAllBookEntries = unstable_cache(
  async () => {
    return db
      .select({
        bookSlug: curriculumEntries.bookSlug,
        bookTitle: curriculumEntries.bookTitle,
        position: curriculumEntries.position,
        partTitle: curriculumEntries.partTitle,
        articleSlug: articles.slug,
        articleTitle: articles.title,
        entryId: curriculumEntries.id,
      })
      .from(curriculumEntries)
      .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
      .orderBy(asc(curriculumEntries.bookSlug), asc(curriculumEntries.position));
  },
  ["all-book-entries"],
  { tags: [TAGS.curriculum], revalidate: 3600 }
);

export const getArticle = unstable_cache(
  async (slug: string) => {
    return db.query.articles.findFirst({
      where: eq(articles.slug, slug),
      with: { articleCategories: { with: { category: true } } },
    });
  },
  ["article"],
  { tags: [TAGS.articles], revalidate: 3600 }
);

export const getBookEntries = unstable_cache(
  async (bookSlug: string) => {
    return db
      .select({
        id: curriculumEntries.id,
        bookTitle: curriculumEntries.bookTitle,
        position: curriculumEntries.position,
        partTitle: curriculumEntries.partTitle,
        articleSlug: articles.slug,
        articleTitle: articles.title,
        summary: articles.summary,
      })
      .from(curriculumEntries)
      .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
      .where(eq(curriculumEntries.bookSlug, bookSlug))
      .orderBy(asc(curriculumEntries.position));
  },
  ["book-entries"],
  { tags: [TAGS.curriculum], revalidate: 3600 }
);

export const getAnimations = unstable_cache(
  async (query: string, limit: number, offset: number) => {
    const where = query
      ? or(
          ilike(savedAnimations.name, `%${query}%`),
          ilike(savedAnimations.slug, `%${query}%`)
        )
      : undefined;

    const [animations, [{ total }]] = await Promise.all([
      db
        .select()
        .from(savedAnimations)
        .where(where)
        .orderBy(savedAnimations.createdAt)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(savedAnimations).where(where),
    ]);

    return { animations, total };
  },
  ["animations"],
  { tags: [TAGS.animations], revalidate: 3600 }
);

export const getArticlesByCategory = unstable_cache(
  async (categoryId: number, limit: number, offset: number) => {
    const [results, [{ total }]] = await Promise.all([
      db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          summary: articles.summary,
          updatedAt: articles.updatedAt,
        })
        .from(articles)
        .innerJoin(articleCategories, eq(articles.id, articleCategories.articleId))
        .where(eq(articleCategories.categoryId, categoryId))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(articles)
        .innerJoin(articleCategories, eq(articles.id, articleCategories.articleId))
        .where(eq(articleCategories.categoryId, categoryId)),
    ]);

    return { results, total };
  },
  ["articles-by-category"],
  { tags: [TAGS.categories, TAGS.articles], revalidate: 3600 }
);
