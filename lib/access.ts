import { db } from "@/db";
import { resourceVisibility, accessGrants, orgMemberships } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentType = "article" | "book" | "object" | "event";

export interface ContentRef {
  type: ContentType;
  ownerType: "user" | "org";
  ownerId: number;
  slug: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getVisibility(
  type: ContentType,
  ownerType: string,
  ownerId: number,
  slug: string
): Promise<"public" | "org" | "private"> {
  const [row] = await db
    .select({ visibility: resourceVisibility.visibility })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, type),
        eq(resourceVisibility.ownerType, ownerType),
        eq(resourceVisibility.ownerId, ownerId),
        eq(resourceVisibility.resourceKey, slug)
      )
    )
    .limit(1);
  return (row?.visibility as "public" | "org" | "private") ?? "public";
}

async function getUserOrgIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));
  return rows.map((r) => r.orgId);
}

async function hasGrant(
  type: ContentType,
  ownerType: string,
  ownerId: number,
  slug: string,
  userId: number,
  orgIds: number[]
): Promise<boolean> {
  // User grant
  const [userRow] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, type),
        eq(accessGrants.ownerType, ownerType),
        eq(accessGrants.ownerId, ownerId),
        eq(accessGrants.resourceKey, slug),
        eq(accessGrants.granteeType, "user"),
        eq(accessGrants.granteeId, userId)
      )
    )
    .limit(1);
  if (userRow) return true;

  if (orgIds.length === 0) return false;

  // Org grant
  const [orgRow] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, type),
        eq(accessGrants.ownerType, ownerType),
        eq(accessGrants.ownerId, ownerId),
        eq(accessGrants.resourceKey, slug),
        eq(accessGrants.granteeType, "org"),
        inArray(accessGrants.granteeId, orgIds)
      )
    )
    .limit(1);
  return !!orgRow;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the session can view a piece of content.
 *
 * Algorithm:
 * 1. Root admin → always true.
 * 2. Look up resourceVisibility. Absent = 'public'.
 * 3. 'public' → true.
 * 4. 'org' → owner must be an org; true iff user is a member of that org.
 * 5. 'private' → check accessGrants (user grant or org grant).
 */
export async function canView(
  ref: ContentRef,
  session: SessionPayload | null
): Promise<boolean> {
  if (session?.isRootAdmin) return true;

  const vis = await getVisibility(ref.type, ref.ownerType, ref.ownerId, ref.slug);

  if (vis === "public") return true;

  if (!session) return false;

  if (vis === "org") {
    // 'org' visibility is only meaningful for org-owned content
    if (ref.ownerType !== "org") return false;
    const orgIds = await getUserOrgIds(session.userId);
    return orgIds.includes(ref.ownerId);
  }

  // 'private'
  const orgIds = await getUserOrgIds(session.userId);
  return hasGrant(ref.type, ref.ownerType, ref.ownerId, ref.slug, session.userId, orgIds);
}

/**
 * Filters a list of ContentRef objects down to those visible to `session`.
 * Uses batched queries: one resourceVisibility query, then one accessGrants
 * query for the private subset, then membership check for org-visible ones.
 */
export async function filterVisible<T extends ContentRef>(
  refs: T[],
  session: SessionPayload | null
): Promise<T[]> {
  if (session?.isRootAdmin) return refs;
  if (refs.length === 0) return [];

  // Fetch all visibility rows for this set
  // We need to match on (type, ownerType, ownerId, slug) tuples.
  // Simplest approach: fetch all visibility rows for the owner combinations present,
  // then match in memory.
  const ownerPairs = Array.from(
    new Set(refs.map((r) => `${r.ownerType}:${r.ownerId}`))
  ).map((pair) => {
    const [ownerType, ownerIdStr] = pair.split(":");
    return { ownerType, ownerId: parseInt(ownerIdStr, 10) };
  });

  // Fetch all visibility settings for involved owners
  const visRows = await Promise.all(
    ownerPairs.map(({ ownerType, ownerId }) =>
      db
        .select({
          resourceType: resourceVisibility.resourceType,
          ownerType: resourceVisibility.ownerType,
          ownerId: resourceVisibility.ownerId,
          resourceKey: resourceVisibility.resourceKey,
          visibility: resourceVisibility.visibility,
        })
        .from(resourceVisibility)
        .where(
          and(
            eq(resourceVisibility.ownerType, ownerType),
            eq(resourceVisibility.ownerId, ownerId)
          )
        )
    )
  );

  // Build lookup: "type:ownerType:ownerId:slug" → visibility
  const visMap = new Map<string, "public" | "org" | "private">();
  for (const rows of visRows) {
    for (const row of rows) {
      const key = `${row.resourceType}:${row.ownerType}:${row.ownerId}:${row.resourceKey}`;
      visMap.set(key, row.visibility as "public" | "org" | "private");
    }
  }

  const publicRefs: T[] = [];
  const orgRefs: T[] = [];
  const privateRefs: T[] = [];

  for (const ref of refs) {
    const key = `${ref.type}:${ref.ownerType}:${ref.ownerId}:${ref.slug}`;
    const vis = visMap.get(key) ?? "public";
    if (vis === "public") publicRefs.push(ref);
    else if (vis === "org") orgRefs.push(ref);
    else privateRefs.push(ref);
  }

  const visible: T[] = [...publicRefs];

  if (!session) return visible;

  const userOrgIds = await getUserOrgIds(session.userId);

  // Org-visible: user must be a member of the owning org
  for (const ref of orgRefs) {
    if (ref.ownerType === "org" && userOrgIds.includes(ref.ownerId)) {
      visible.push(ref);
    }
  }

  // Private: check grants
  if (privateRefs.length > 0) {
    // Fetch user grants for this set
    const slugsForGrant = privateRefs.map((r) => r.slug);
    const userGrantRows = await db
      .select({ resourceKey: accessGrants.resourceKey, ownerId: accessGrants.ownerId })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.granteeType, "user"),
          eq(accessGrants.granteeId, session.userId),
          inArray(accessGrants.resourceKey, slugsForGrant)
        )
      );
    const userGrantSet = new Set(userGrantRows.map((g) => `${g.ownerId}:${g.resourceKey}`));

    let orgGrantSet = new Set<string>();
    if (userOrgIds.length > 0) {
      const orgGrantRows = await db
        .select({ resourceKey: accessGrants.resourceKey, ownerId: accessGrants.ownerId })
        .from(accessGrants)
        .where(
          and(
            eq(accessGrants.granteeType, "org"),
            inArray(accessGrants.granteeId, userOrgIds),
            inArray(accessGrants.resourceKey, slugsForGrant)
          )
        );
      orgGrantSet = new Set(orgGrantRows.map((g) => `${g.ownerId}:${g.resourceKey}`));
    }

    for (const ref of privateRefs) {
      const grantKey = `${ref.ownerId}:${ref.slug}`;
      if (userGrantSet.has(grantKey) || orgGrantSet.has(grantKey)) {
        visible.push(ref);
      }
    }
  }

  return visible;
}
