import Link from "next/link";
import FormErrorBanner from "@/components/FormErrorBanner";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { organizations, orgMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "slug_taken"
      ? "That publisher slug is already taken. Pick a different one."
      : error === "email_taken"
      ? "A user with that email address already exists."
      : null;
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
    <main className="flex-1">
      {errorMessage && (
        <div className="max-w-2xl mx-auto px-5 pt-6">
          <FormErrorBanner message={errorMessage} />
        </div>
      )}

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto px-5">
          <div className="flex items-end justify-between gap-8 py-8 sm:py-11">

            <div>
              <p className="ps-eyebrow mb-3">Account</p>
              <h1
                className="ps-display themed-heading"
                style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
              >
                Organizations
              </h1>
            </div>

            {session && (
              <Link
                href="/organizations/new"
                className="themed-btn-accent rounded-lg shrink-0"
                style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
              >
                New organization
              </Link>
            )}

          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-12">

        {/* Not signed in */}
        {!session && (
          <div className="py-24 text-center">
            <p className="ps-eyebrow mb-3">Members only</p>
            <p className="themed-muted mb-8" style={{ fontSize: "0.9375rem" }}>
              Sign in to see your organizations.
            </p>
            <Link
              href="/login"
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
            >
              Sign in
            </Link>
          </div>
        )}

        {/* Signed in, no orgs */}
        {session && myOrgs.length === 0 && (
          <div className="py-24 text-center">
            <p className="ps-eyebrow mb-3">No organizations</p>
            <p className="themed-muted mb-8" style={{ fontSize: "0.9375rem" }}>
              You are not a member of any organizations yet.
            </p>
            <Link
              href="/organizations/new"
              className="themed-btn-accent rounded-lg"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
            >
              Create one
            </Link>
          </div>
        )}

        {/* Org list */}
        {myOrgs.length > 0 && (
          <>
            <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-2">
              <p className="ps-eyebrow-muted">Your organizations</p>
              <span
                className="themed-muted"
                style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}
              >
                {myOrgs.length}
              </span>
            </div>

            {myOrgs.map((org) => (
              <Link
                key={org.id}
                href={`/${org.publisherSlug}`}
                className="group flex items-center gap-4 hover:bg-[var(--surface)] transition-colors"
                style={{ borderBottom: "1px solid var(--border)", padding: "0.875rem 0.5rem", textDecoration: "none" }}
              >
                {/* Initial avatar */}
                <div
                  className="ps-pub-avatar shrink-0"
                  style={{ width: "2.5rem", height: "2.5rem", fontSize: "1rem", borderRadius: "0.375rem" }}
                >
                  {org.name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="article-title-serif group-hover:text-[var(--accent)] transition-colors"
                    style={{ fontSize: "0.9375rem" }}
                  >
                    {org.name}
                  </p>
                  <p
                    className="themed-muted"
                    style={{
                      fontSize: "0.5625rem",
                      fontFamily: "ui-monospace, monospace",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginTop: 3,
                    }}
                  >
                    @{org.publisherSlug}
                  </p>
                </div>

                <span
                  className="themed-muted opacity-0 group-hover:opacity-50 transition-opacity shrink-0"
                  aria-hidden="true"
                  style={{ fontSize: "0.875rem" }}
                >
                  →
                </span>
              </Link>
            ))}
          </>
        )}

      </div>
    </main>
  );
}
