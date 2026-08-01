import type { MetadataRoute } from "next"
import { unstable_cache } from "next/cache"
import { db } from "@/db"
import { articles, books, publishers, resourceVisibility } from "@/db/schema"
import { eq, and, sql, isNull, or } from "drizzle-orm"
import { config } from "@/lib/config"

const BASE_URL = config.siteUrl

// Next.js prerenders `sitemap.ts` at build time by default, which made every
// production build depend on the database being reachable — a Neon outage or
// an exhausted compute quota would fail the build outright and block shipping
// even changes unrelated to data. Rendering on demand instead keeps the build
// hermetic.
export const dynamic = "force-dynamic"

/**
 * The three queries backing the sitemap, cached as a unit.
 *
 * `force-dynamic` alone would move the DB load from build time to *every*
 * crawler request, which is the opposite of what we want: search engine bots
 * are a steady trickle, and on Neon each request that reaches Postgres keeps
 * the compute endpoint from suspending. Caching for an hour means crawlers are
 * served from the cache and the database sees at most one sitemap build per
 * hour.
 */
const getSitemapData = unstable_cache(
  async () => {
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
        and(
          isNull(books.deletedAt),
          or(isNull(resourceVisibility.visibility), eq(resourceVisibility.visibility, "public"))
        )
      )

    const pubRows = await db
      .select({ slug: publishers.slug, kind: publishers.kind, userId: publishers.userId, orgId: publishers.orgId })
      .from(publishers)

    return { publicArticles, publicBooks, pubRows }
  },
  ["sitemap:data"],
  { tags: ["sitemap"], revalidate: 3600 }
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { publicArticles, publicBooks, pubRows } = await getSitemapData()

  // Build publisher slug lookup
  const pubMap = new Map<string, string>() // "user:id" or "org:id" → publisherSlug
  for (const p of pubRows) {
    const key = p.kind === "user" ? `user:${p.userId}` : `org:${p.orgId}`
    pubMap.set(key, p.slug)
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
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

  return [
    ...staticRoutes,
    ...articleRoutes,
    ...bookRoutes,
  ]
}
