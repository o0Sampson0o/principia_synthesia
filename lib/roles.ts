import { db } from "@/db";
import { orgMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";

export type OrgRole = "super_admin" | "admin" | "member";

/**
 * Returns the role of `userId` in `orgId`, or null if they are not a member.
 */
export async function getOrgRole(
  userId: number,
  orgId: number
): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: orgMemberships.role })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)))
    .limit(1);

  if (!row) return null;
  return row.role as OrgRole;
}

/**
 * Returns true if the session can manage an org (add/remove members, change
 * visibility, etc.). Requires root admin, super_admin, or admin of the org.
 */
export async function canManageOrg(
  session: SessionPayload | null,
  orgId: number
): Promise<boolean> {
  if (!session) return false;
  if (session.isRootAdmin) return true;
  const role = await getOrgRole(session.userId, orgId);
  return role === "super_admin" || role === "admin";
}

/**
 * Returns true if the session can create/edit/delete content owned by the
 * given publisher (ownerType + ownerId).
 *
 * - User-owned content: only the same user (or root admin).
 * - Org-owned content: super_admin or admin of that org (or root admin).
 */
export async function canEditContent(
  session: SessionPayload | null,
  ownerType: "user" | "org",
  ownerId: number
): Promise<boolean> {
  if (!session) return false;
  if (session.isRootAdmin) return true;

  if (ownerType === "user") {
    return session.userId === ownerId;
  }

  // org-owned
  const role = await getOrgRole(session.userId, ownerId);
  return role === "super_admin" || role === "admin";
}

/**
 * Returns true if the target user is protected from demotion or removal.
 * Protected if they are the org creator or the root admin.
 * Always protect super_admin rows created for those two parties.
 */
export function isSuperAdminProtected(
  targetUserId: number,
  orgCreatorId: number | null,
  rootAdminId: number
): boolean {
  return targetUserId === rootAdminId || targetUserId === orgCreatorId;
}
