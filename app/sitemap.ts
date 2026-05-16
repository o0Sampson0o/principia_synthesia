import type { MetadataRoute } from "next"
import { db } from "@/db"
import { articles, categories, curriculumEntries, objects } from "@/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access"

const BASE_URL = "https://principia-synthesia.vercel.app"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [allArticles, allCategories, allEntries, allObjects] = await Promise.all([
    db.select({ slug: articles.slug, updatedAt: articles.updatedAt }).from(articles).where(
      and(
        eq(articles.isInternal, false),
        sql`${articles.metadata}->>'status' = 'published'`
      )
    ),
    db.select({ slug: categories.slug }).from(categories),
    db.select({ bookSlug: curriculumEntries.bookSlug }).from(curriculumEntries),
    db.select({ slug: objects.slug, updatedAt: objects.updatedAt }).from(objects),
  ])

  // Filter private resources — sitemap runs without a session (null = unauthenticated visitor)
  const articleVisibility = await getVisibleArticleSlugs(null, allArticles.map((a) => a.slug))
  const publicArticles =
    articleVisibility === "all"
      ? allArticles
      : allArticles.filter((a) => articleVisibility.has(a.slug))

  const bookSlugsRaw = [...new Set(allEntries.map((e) => e.bookSlug))]
  const bookVisibility = await getVisibleBookSlugs(null, bookSlugsRaw)
  const bookSlugs = bookVisibility === "all" ? bookSlugsRaw : bookSlugsRaw.filter((s) => bookVisibility.has(s))

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/objects`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/category`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/search`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ]

  const articleRoutes: MetadataRoute.Sitemap = publicArticles.map((a) => ({
    url: `${BASE_URL}/${a.slug}`,
    lastModified: a.updatedAt ?? undefined,
    changeFrequency: "monthly",
    priority: 0.8,
  }))

  const categoryRoutes: MetadataRoute.Sitemap = allCategories.map((c) => ({
    url: `${BASE_URL}/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }))

  const bookRoutes: MetadataRoute.Sitemap = bookSlugs.map((slug) => ({
    url: `${BASE_URL}/curriculum/${slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  const objectRoutes: MetadataRoute.Sitemap = allObjects.map((o) => ({
    url: `${BASE_URL}/objects/${o.slug}`,
    lastModified: o.updatedAt ?? undefined,
    changeFrequency: "monthly",
    priority: 0.5,
  }))

  return [
    ...staticRoutes,
    ...articleRoutes,
    ...categoryRoutes,
    ...bookRoutes,
    ...objectRoutes,
  ]
}
