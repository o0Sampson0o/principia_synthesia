import { createHash } from "crypto";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { orgInvitations, organizations } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { acceptInvitation } from "@/app/[publisher]/members/actions";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  const [invitation] = await db
    .select()
    .from(orgInvitations)
    .where(
      and(
        eq(orgInvitations.tokenHash, tokenHash),
        gt(orgInvitations.expiresAt, now)
      )
    )
    .limit(1);

  if (!invitation) {
    return (
      <main className="max-w-lg mx-auto px-5 py-16 text-center">
        <p className="ps-eyebrow mb-4">Invitation</p>
        <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Invitation not found</h1>
        <p className="themed-muted mb-8" style={{ fontSize: "0.9375rem" }}>
          This invitation link is invalid or has expired.
        </p>
        <Link href="/" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
          Go home
        </Link>
      </main>
    );
  }

  if (invitation.acceptedAt) {
    return (
      <main className="max-w-lg mx-auto px-5 py-16 text-center">
        <p className="ps-eyebrow mb-4">Invitation</p>
        <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Already accepted</h1>
        <p className="themed-muted mb-8" style={{ fontSize: "0.9375rem" }}>This invitation has already been accepted.</p>
        <Link href="/" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
          Go home
        </Link>
      </main>
    );
  }

  const [org] = await db
    .select({ name: organizations.name, publisherSlug: organizations.publisherSlug })
    .from(organizations)
    .where(eq(organizations.id, invitation.orgId))
    .limit(1);

  const session = await getSession();

  if (!session) {
    const loginUrl = `/login?redirect=/invitations/${token}`;
    return (
      <main className="max-w-lg mx-auto px-5 py-16 text-center">
        <p className="ps-eyebrow mb-4">Invitation</p>
        <h1 className="ps-display themed-heading mb-5" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          Join {org?.name ?? "an organisation"}
        </h1>
        <p className="themed-muted mb-1" style={{ fontSize: "0.9375rem" }}>
          You have been invited as a <strong className="themed-heading">{invitation.role}</strong>.
        </p>
        <p className="themed-muted mb-8" style={{ fontSize: "0.875rem" }}>
          Invited email: {invitation.email}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={loginUrl} className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
            Sign in
          </Link>
          <Link href={`/signup?email=${encodeURIComponent(invitation.email)}&redirect=/invitations/${token}`} className="themed-btn-outline rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
            Create account
          </Link>
        </div>
      </main>
    );
  }

  const result = await acceptInvitation(token);

  if (result.error) {
    return (
      <main className="max-w-lg mx-auto px-5 py-16 text-center">
        <p className="ps-eyebrow mb-4">Invitation</p>
        <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Cannot accept invitation</h1>
        <p className="themed-muted mb-8" style={{ fontSize: "0.9375rem" }}>{result.error}</p>
        <Link href="/" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
          Go home
        </Link>
      </main>
    );
  }

  if (result.publisherSlug) {
    redirect(`/${result.publisherSlug}`);
  }

  notFound();
}
