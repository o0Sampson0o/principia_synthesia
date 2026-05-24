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
      <main className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold themed-heading mb-4">Invitation not found</h1>
        <p className="themed-muted mb-6">
          This invitation link is invalid or has expired.
        </p>
        <Link href="/" className="themed-btn-primary px-6 py-2">
          Go home
        </Link>
      </main>
    );
  }

  if (invitation.acceptedAt) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold themed-heading mb-4">Already accepted</h1>
        <p className="themed-muted mb-6">This invitation has already been accepted.</p>
        <Link href="/" className="themed-btn-primary px-6 py-2">
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
      <main className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold themed-heading mb-4">
          Join {org?.name ?? "an organisation"}
        </h1>
        <p className="themed-muted mb-2">
          You have been invited as a <strong>{invitation.role}</strong>.
        </p>
        <p className="themed-muted mb-6 text-sm">
          Invited email: <strong>{invitation.email}</strong>
        </p>
        <p className="themed-muted mb-6">
          Sign in or create an account to accept this invitation.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={loginUrl} className="themed-btn-primary px-6 py-2">
            Sign in
          </Link>
          <Link href={`/signup?email=${encodeURIComponent(invitation.email)}&redirect=/invitations/${token}`} className="themed-btn-ghost px-6 py-2">
            Create account
          </Link>
        </div>
      </main>
    );
  }

  const result = await acceptInvitation(token);

  if (result.error) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold themed-heading mb-4">Cannot accept invitation</h1>
        <p className="themed-muted mb-6">{result.error}</p>
        <Link href="/" className="themed-btn-primary px-6 py-2">
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
