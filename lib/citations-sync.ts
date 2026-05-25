import { db } from "@/db";
import { articles, articleCitations, publishers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { extractCitationSlugs } from "@/lib/citations-extract";

export interface SyncResult {
  added: number[];   // citedArticleId values newly added
  removed: number[]; // citedArticleId values no longer cited
}

/**
 * Resolve a `publisher/article-slug` string to an articleId, or return null
 * if the article doesn't exist.
 */
async function resolveSlug(slug: string): Promise<number | null> {
  const slashIdx = slug.indexOf("/");
  if (slashIdx === -1) return null;

  const publisherSlug = slug.slice(0, slashIdx);
  const articleSlug = slug.slice(slashIdx + 1);

  const [pubRow] = await db
    .select({ kind: publishers.kind, userId: publishers.userId, orgId: publishers.orgId })
    .from(publishers)
    .where(eq(publishers.slug, publisherSlug))
    .limit(1);

  if (!pubRow) return null;

  const ownerType = pubRow.kind;
  const ownerId = ownerType === "user" ? pubRow.userId : pubRow.orgId;
  if (ownerId === null) return null;

  const [articleRow] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        eq(articles.slug, articleSlug)
      )
    )
    .limit(1);

  return articleRow?.id ?? null;
}

/**
 * Synchronise the `article_citations` rows for a citing article.
 *
 * 1. Extract <Cite slug="publisher/article-slug"/> slugs from the MDX.
 * 2. Batch-resolve each slug to an articleId. Unresolvable slugs are skipped.
 * 3. Diff the new set against existing rows.
 * 4. Delete removed rows; insert added rows with sequential position.
 * 5. Return { added, removed } so the caller can fire notifications for `added`.
 */
export async function syncArticleCitations(
  citingArticleId: number,
  mdx: string
): Promise<SyncResult> {
  const slugs = extractCitationSlugs(mdx);

  // Resolve slugs to article IDs (deduplicated, excludes self-references)
  const newCitedIds: number[] = [];
  for (const slug of slugs) {
    const id = await resolveSlug(slug);
    if (id !== null && id !== citingArticleId && !newCitedIds.includes(id)) {
      newCitedIds.push(id);
    }
  }

  // Read existing citation rows for this citing article
  const existingRows = await db
    .select({ citedArticleId: articleCitations.citedArticleId })
    .from(articleCitations)
    .where(eq(articleCitations.citingArticleId, citingArticleId));

  const existingIds = existingRows.map((r) => r.citedArticleId);

  const addedIds = newCitedIds.filter((id) => !existingIds.includes(id));
  const removedIds = existingIds.filter((id) => !newCitedIds.includes(id));

  // Delete removed citation rows
  if (removedIds.length > 0) {
    await db
      .delete(articleCitations)
      .where(
        and(
          eq(articleCitations.citingArticleId, citingArticleId),
          inArray(articleCitations.citedArticleId, removedIds)
        )
      );
  }

  // Insert added citation rows with sequential position (index within newCitedIds)
  if (addedIds.length > 0) {
    await db.insert(articleCitations).values(
      addedIds.map((citedId) => ({
        citingArticleId,
        citedArticleId: citedId,
        position: newCitedIds.indexOf(citedId),
      }))
    );
  }

  return { added: addedIds, removed: removedIds };
}
