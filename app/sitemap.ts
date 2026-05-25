import type { MetadataRoute } from "next"
import { db } from "@/db"
import { articles, categories, books, publishers, resourceVisibility } from "@/db/schema"
import { eq, and, sql, isNull, or } from "drizzle-orm"

const BASE_URL = "https://principia-synthesia.vercel.app"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch only public articles
  const publicArticles = await db
    .select({
      slug: articles.slug,
      ownerType: articles.ownerType,
      ownerId: articles.ownerId,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "article"),
        eq(resourceVisibility.ownerType, articles.ownerType),
        eq(resourceVisibility.ownerId, articles.ownerId),
        eq(resourceVisibility.resourceKey, articles.slug)
      )
    )
    .where(
      and(
        eq(articles.isInternal, false),
        sql`${articles.metadata}->>'status' = 'published'`,
        or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public")),
        isNull(articles.deletedAt)
      )
    )

  // Fetch only public books
  const publicBooks = await db
    .select({
      slug: books.slug,
      ownerType: books.ownerType,
      ownerId: books.ownerId,
    })
    .from(books)
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "book"),
        eq(resourceVisibility.ownerType, books.ownerType),
        eq(resourceVisibility.ownerId, books.ownerId),
        eq(resourceVisibility.resourceKey, books.slug)
      )
    )
    .where(
      or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
    )

  const allCategories = await db.select({ slug: categories.slug }).from(categories)

  // Build publisher slug lookup
  const pubRows = await db
    .select({ slug: publishers.slug, kind: publishers.kind, userId: publishers.userId, orgId: publishers.orgId })
    .from(publishers)

  const pubMap = new Map<string, string>() // "user:id" or "org:id" → publisherSlug
  for (const p of pubRows) {
    const key = p.kind === "user" ? `user:${p.userId}` : `org:${p.orgId}`
    pubMap.set(key, p.slug)
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/category`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/search`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/organizations`, changeFrequency: "weekly", priority: 0.4 },
  ]

  const articleRoutes: MetadataRoute.Sitemap = publicArticles.flatMap((a) => {
    const publisherSlug = pubMap.get(`${a.ownerType}:${a.ownerId}`)
    if (!publisherSlug) return []
    return [{
      url: `${BASE_URL}/${publisherSlug}/articles/${a.slug}`,
      lastModified: a.updatedAt ?? undefined,
      changeFrequency: "monthly",
      priority: 0.8,
    }]
  })

  const bookRoutes: MetadataRoute.Sitemap = publicBooks.flatMap((b) => {
    const publisherSlug = pubMap.get(`${b.ownerType}:${b.ownerId}`)
    if (!publisherSlug) return []
    return [{
      url: `${BASE_URL}/${publisherSlug}/books/${b.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }]
  })

  const categoryRoutes: MetadataRoute.Sitemap = allCategories.map((c) => ({
    url: `${BASE_URL}/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }))

  return [
    ...staticRoutes,
    ...articleRoutes,
    ...bookRoutes,
    ...categoryRoutes,
  ]
}
