"use server";

import { db } from "@/db";
import { orgInvitations, orgMemberships, organizations, users } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { canManageOrg, getOrgRole } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { inviteMemberSchema, cancelInvitationSchema } from "@/lib/validations";
import { sendEmail, buildInvitationEmailHtml } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

const INVITATION_EXPIRY_DAYS = 7;

async function assertCanInvite(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub || pub.kind !== "org") throw new Error("Not an org publisher");
  const orgId = pub.orgId!;
  if (!(await canManageOrg(session, orgId))) throw new Error("Forbidden");
  return { session, orgId, pub };
}

export async function inviteMember(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const { session, orgId } = await assertCanInvite(publisherSlug);

  if (!rateLimit(`invite:${orgId}`, 5, 60 * 60 * 1000)) {
    return { error: "Too many invitations sent recently. Please try again later." };
  }

  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, role } = parsed.data;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    const alreadyMember = await getOrgRole(existing.id, orgId);
    if (alreadyMember) {
      return { error: "This user is already a member of the organisation" };
    }
  }

  const [existingInvite] = await db
    .select({ id: orgInvitations.id })
    .from(orgInvitations)
    .where(
      and(
        eq(orgInvitations.orgId, orgId),
        eq(orgInvitations.email, email)
      )
    )
    .limit(1);

  if (existingInvite) {
    return { error: "An invitation has already been sent to this email address" };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(orgInvitations).values({
    orgId,
    email,
    role,
    tokenHash,
    invitedBy: session.userId,
    expiresAt,
  });

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [inviter] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${siteUrl}/invitations/${rawToken}`;

  await sendEmail({
    to: email,
    subject: `You're invited to join ${org?.name ?? "an organisation"}`,
    html: buildInvitationEmailHtml({
      orgName: org?.name ?? "the organisation",
      inviterName: inviter?.displayName || inviter?.email || "Someone",
      role,
      acceptUrl,
    }),
  });

  revalidatePath(`/${publisherSlug}/members`);
  return { success: true };
}

export async function cancelInvitation(
  publisherSlug: string,
  formData: FormData
): Promise<void> {
  const { orgId } = await assertCanInvite(publisherSlug);

  const parsed = cancelInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db
    .delete(orgInvitations)
    .where(
      and(
        eq(orgInvitations.id, parsed.data.invitationId),
        eq(orgInvitations.orgId, orgId)
      )
    );

  revalidatePath(`/${publisherSlug}/members`);
}

export async function acceptInvitation(
  token: string
): Promise<{ error?: string; publisherSlug?: string }> {
  const session = await requireSession();
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
    return { error: "Invitation not found or has expired" };
  }

  if (invitation.acceptedAt) {
    return { error: "This invitation has already been accepted" };
  }

  const [sessionUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!sessionUser || sessionUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return { error: "This invitation was sent to a different email address" };
  }

  const alreadyMember = await getOrgRole(session.userId, invitation.orgId);
  if (alreadyMember) {
    await db
      .update(orgInvitations)
      .set({ acceptedAt: now })
      .where(eq(orgInvitations.id, invitation.id));
    const [org] = await db
      .select({ publisherSlug: organizations.publisherSlug })
      .from(organizations)
      .where(eq(organizations.id, invitation.orgId))
      .limit(1);
    return { publisherSlug: org?.publisherSlug };
  }

  await db.insert(orgMemberships).values({
    orgId: invitation.orgId,
    userId: session.userId,
    role: invitation.role,
  });

  await db
    .update(orgInvitations)
    .set({ acceptedAt: now })
    .where(eq(orgInvitations.id, invitation.id));

  const [org] = await db
    .select({ publisherSlug: organizations.publisherSlug })
    .from(organizations)
    .where(eq(organizations.id, invitation.orgId))
    .limit(1);

  revalidatePath(`/${org?.publisherSlug}/members`);
  return { publisherSlug: org?.publisherSlug };
}

export async function resendInvitation(
  publisherSlug: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const { session, orgId } = await assertCanInvite(publisherSlug);

  if (!rateLimit(`invite:${orgId}`, 5, 60 * 60 * 1000)) {
    return { error: "Too many invitations sent recently. Please try again later." };
  }

  const invitationId = Number(formData.get("invitationId"));
  if (!invitationId) return { error: "Invalid invitation" };

  const [invitation] = await db
    .select()
    .from(orgInvitations)
    .where(
      and(
        eq(orgInvitations.id, invitationId),
        eq(orgInvitations.orgId, orgId)
      )
    )
    .limit(1);

  if (!invitation) return { error: "Invitation not found" };

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(orgInvitations)
    .set({ tokenHash, expiresAt, acceptedAt: null })
    .where(eq(orgInvitations.id, invitationId));

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [inviter] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${siteUrl}/invitations/${rawToken}`;

  await sendEmail({
    to: invitation.email,
    subject: `You're invited to join ${org?.name ?? "an organisation"}`,
    html: buildInvitationEmailHtml({
      orgName: org?.name ?? "the organisation",
      inviterName: inviter?.displayName || inviter?.email || "Someone",
      role: invitation.role,
      acceptUrl,
    }),
  });

  revalidatePath(`/${publisherSlug}/members`);
  return { success: true };
}
