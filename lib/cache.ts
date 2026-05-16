import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { articles, curriculumEntries, books, articleCategories } from "@/db/schema";
import { desc, asc, eq, count } from "drizzle-orm";

export const TAGS = {
  articles: "articles",
  article: (slug: string) => `article:${slug}`,
  curriculum: "curriculum",
  book: (slug: string) => `book:${slug}`,
  categories: "categories",
  objects: "objects",
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
        bookId: curriculumEntries.bookId,
        bookSlug: books.slug,
        bookTitle: books.title,
        position: curriculumEntries.position,
        partTitle: curriculumEntries.partTitle,
        articleSlug: articles.slug,
        articleTitle: articles.title,
        entryId: curriculumEntries.id,
      })
      .from(curriculumEntries)
      .innerJoin(books, eq(curriculumEntries.bookId, books.id))
      .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
      .orderBy(asc(books.slug), asc(curriculumEntries.position));
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
  async (bookId: number) => {
    return db
      .select({
        id: curriculumEntries.id,
        position: curriculumEntries.position,
        partTitle: curriculumEntries.partTitle,
        articleSlug: articles.slug,
        articleTitle: articles.title,
        summary: articles.summary,
      })
      .from(curriculumEntries)
      .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
      .where(eq(curriculumEntries.bookId, bookId))
      .orderBy(asc(curriculumEntries.position));
  },
  ["book-entries"],
  { tags: [TAGS.curriculum], revalidate: 3600 }
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
