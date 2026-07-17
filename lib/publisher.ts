import { db } from "@/db";
import { publishers, users, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface ResolvedPublisher {
  kind: "user" | "org";
  userId: number | null;
  orgId: number | null;
  slug: string;
  displayName: string; // user.displayName or org.name
  /** Guest comments post straight to 'approved' instead of the mod queue. */
  allowUnmoderatedGuests: boolean;
}

/**
 * Resolves a publisher slug to a ResolvedPublisher object.
 * Returns null if no publisher with the given slug exists.
 *
 * Every page under /[publisher]/** should call this first and return notFound()
 * if the result is null.
 */
export async function resolvePublisher(slug: string): Promise<ResolvedPublisher | null> {
  const rows = await db
    .select({
      id: publishers.id,
      slug: publishers.slug,
      kind: publishers.kind,
      userId: publishers.userId,
      orgId: publishers.orgId,
      allowUnmoderatedGuests: publishers.allowUnmoderatedGuests,
      userDisplayName: users.displayName,
      orgName: organizations.name,
    })
    .from(publishers)
    .leftJoin(users, eq(publishers.userId, users.id))
    .leftJoin(organizations, eq(publishers.orgId, organizations.id))
    .where(eq(publishers.slug, slug))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const displayName =
    row.kind === "user"
      ? (row.userDisplayName ?? slug)
      : (row.orgName ?? slug);

  return {
    kind: row.kind as "user" | "org",
    userId: row.userId,
    orgId: row.orgId,
    slug: row.slug,
    displayName,
    allowUnmoderatedGuests: row.allowUnmoderatedGuests,
  };
}
