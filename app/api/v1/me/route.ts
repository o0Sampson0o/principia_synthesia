import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, orgMemberships } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireApiSession } from "@/lib/api-auth";

/**
 * GET /api/v1/me — identifies the token's owner and lists the publishers the
 * token can write to. Used by `ps-sync init` to validate a token.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (auth instanceof NextResponse) return auth;

  const orgRows = await db
    .select({ publisherSlug: organizations.publisherSlug, role: orgMemberships.role })
    .from(orgMemberships)
    .innerJoin(organizations, eq(orgMemberships.orgId, organizations.id))
    .where(
      and(
        eq(orgMemberships.userId, auth.userId),
        inArray(orgMemberships.role, ["super_admin", "admin"])
      )
    );

  return NextResponse.json({
    userId: auth.userId,
    email: auth.email,
    publisherSlug: auth.userSlug,
    publishers: [
      { slug: auth.userSlug, kind: "user" as const },
      ...orgRows.map((o) => ({ slug: o.publisherSlug, kind: "org" as const })),
    ],
  });
}
