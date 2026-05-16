import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { organizations, orgMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function OrganizationsPage() {
  const session = await getSession();

  let myOrgs: { id: number; name: string; slug: string; publisherSlug: string }[] = [];

  if (session) {
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        publisherSlug: organizations.publisherSlug,
      })
      .from(organizations)
      .innerJoin(orgMemberships, eq(orgMemberships.orgId, organizations.id))
      .where(eq(orgMemberships.userId, session.userId));
    myOrgs = rows;
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold themed-heading">Organizations</h1>
        {session && (
          <Link href="/organizations/new" className="themed-btn-primary text-sm px-4 py-2">
            New organization
          </Link>
        )}
      </div>

      {!session && (
        <p className="themed-muted">
          <Link href="/login" className="themed-link">Sign in</Link> to see your organizations.
        </p>
      )}

      {session && myOrgs.length === 0 && (
        <p className="themed-muted">You are not a member of any organizations yet.</p>
      )}

      {myOrgs.length > 0 && (
        <ul className="space-y-3">
          {myOrgs.map((org) => (
            <li key={org.id} className="border-b themed-border pb-3">
              <Link href={`/${org.publisherSlug}`} className="themed-link font-medium">
                {org.name}
              </Link>
              <p className="text-xs themed-muted">@{org.publisherSlug}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
