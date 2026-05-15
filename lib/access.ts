import { db } from "@/db";
import { resourceVisibility, accessGrants, orgMemberships } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";

type ResourceType = "book" | "article";

async function isPrivate(resourceType: ResourceType, resourceKey: string): Promise<boolean> {
  const rows = await db
    .select({ isPrivate: resourceVisibility.isPrivate })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, resourceType),
        eq(resourceVisibility.resourceKey, resourceKey)
      )
    )
    .limit(1);
  return rows[0]?.isPrivate ?? false;
}

async function getUserOrgIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));
  return rows.map((r) => r.orgId);
}

async function hasGrant(
  resourceType: ResourceType,
  resourceKey: string,
  userId: number,
  orgIds: number[]
): Promise<boolean> {
  const userMatch = and(
    eq(accessGrants.resourceType, resourceType),
    eq(accessGrants.resourceKey, resourceKey),
    eq(accessGrants.granteeType, "user"),
    eq(accessGrants.granteeId, userId)
  );

  const userRow = await db.select({ id: accessGrants.id }).from(accessGrants).where(userMatch).limit(1);
  if (userRow[0]) return true;

  if (orgIds.length === 0) return false;

  const orgRow = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, resourceType),
        eq(accessGrants.resourceKey, resourceKey),
        eq(accessGrants.granteeType, "org"),
        inArray(accessGrants.granteeId, orgIds)
      )
    )
    .limit(1);
  return !!orgRow[0];
}

export async function canViewBook(bookSlug: string, session: SessionPayload | null): Promise<boolean> {
  if (session?.isAdmin) return true;
  if (!(await isPrivate("book", bookSlug))) return true;
  if (!session?.userId) return false;
  const orgIds = await getUserOrgIds(session.userId);
  return hasGrant("book", bookSlug, session.userId, orgIds);
}

export async function canViewArticle(articleSlug: string, session: SessionPayload | null): Promise<boolean> {
  if (session?.isAdmin) return true;
  if (!(await isPrivate("article", articleSlug))) return true;
  if (!session?.userId) return false;
  const orgIds = await getUserOrgIds(session.userId);
  return hasGrant("article", articleSlug, session.userId, orgIds);
}

export async function getVisibleBookSlugs(
  session: SessionPayload | null,
  allSlugs: string[]
): Promise<Set<string> | "all"> {
  if (session?.isAdmin) return "all";
  if (allSlugs.length === 0) return new Set();

  const privateRows = await db
    .select({ resourceKey: resourceVisibility.resourceKey })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, "book"),
        eq(resourceVisibility.isPrivate, true),
        inArray(resourceVisibility.resourceKey, allSlugs)
      )
    );
  const privateSet = new Set(privateRows.map((r) => r.resourceKey));

  const publicSlugs = allSlugs.filter((s) => !privateSet.has(s));
  const visible = new Set(publicSlugs);

  if (!session?.userId || privateSet.size === 0) return visible;

  const orgIds = await getUserOrgIds(session.userId);

  const userGrants = await db
    .select({ resourceKey: accessGrants.resourceKey })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, "book"),
        eq(accessGrants.granteeType, "user"),
        eq(accessGrants.granteeId, session.userId),
        inArray(accessGrants.resourceKey, Array.from(privateSet))
      )
    );
  for (const g of userGrants) visible.add(g.resourceKey);

  if (orgIds.length > 0) {
    const orgGrants = await db
      .select({ resourceKey: accessGrants.resourceKey })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.resourceType, "book"),
          eq(accessGrants.granteeType, "org"),
          inArray(accessGrants.granteeId, orgIds),
          inArray(accessGrants.resourceKey, Array.from(privateSet))
        )
      );
    for (const g of orgGrants) visible.add(g.resourceKey);
  }

  return visible;
}

export async function getVisibleArticleSlugs(
  session: SessionPayload | null,
  allSlugs: string[]
): Promise<Set<string> | "all"> {
  if (session?.isAdmin) return "all";
  if (allSlugs.length === 0) return new Set();

  const privateRows = await db
    .select({ resourceKey: resourceVisibility.resourceKey })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, "article"),
        eq(resourceVisibility.isPrivate, true),
        inArray(resourceVisibility.resourceKey, allSlugs)
      )
    );
  const privateSet = new Set(privateRows.map((r) => r.resourceKey));

  const publicSlugs = allSlugs.filter((s) => !privateSet.has(s));
  const visible = new Set(publicSlugs);

  if (!session?.userId || privateSet.size === 0) return visible;

  const orgIds = await getUserOrgIds(session.userId);

  const userGrants = await db
    .select({ resourceKey: accessGrants.resourceKey })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, "article"),
        eq(accessGrants.granteeType, "user"),
        eq(accessGrants.granteeId, session.userId),
        inArray(accessGrants.resourceKey, Array.from(privateSet))
      )
    );
  for (const g of userGrants) visible.add(g.resourceKey);

  if (orgIds.length > 0) {
    const orgGrants = await db
      .select({ resourceKey: accessGrants.resourceKey })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.resourceType, "article"),
          eq(accessGrants.granteeType, "org"),
          inArray(accessGrants.granteeId, orgIds),
          inArray(accessGrants.resourceKey, Array.from(privateSet))
        )
      );
    for (const g of orgGrants) visible.add(g.resourceKey);
  }

  return visible;
}
