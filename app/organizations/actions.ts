"use server";

import { db } from "@/db";
import { organizations, publishers, orgMemberships, users, accessGrants } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { canManageOrg, isSuperAdminProtected } from "@/lib/roles";
import {
  createOrganizationSchema,
  deleteOrganizationSchema,
  addOrgMemberSchema,
  removeOrgMemberSchema,
  updateOrgMemberRoleSchema,
} from "@/lib/validations";

export async function createOrganization(formData: FormData) {
  const session = await requireSession();

  const validated = createOrganizationSchema.parse({
    name: formData.get("name"),
    publisherSlug: formData.get("publisherSlug"),
  });

  // Check slug uniqueness
  const existing = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.slug, validated.publisherSlug))
    .limit(1);
  if (existing.length > 0) {
    redirect("/organizations/new?error=slug_taken");
  }

  // Find root admin for auto-super_admin membership
  const [rootAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isRootAdmin, true))
    .limit(1);

  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        slug: validated.publisherSlug,
        name: validated.name,
        creatorId: session.userId,
        publisherSlug: validated.publisherSlug,
      })
      .returning({ id: organizations.id });

    await tx.insert(publishers).values({
      slug: validated.publisherSlug,
      kind: "org",
      orgId: org.id,
    });

    // Creator is super_admin
    await tx.insert(orgMemberships).values({
      orgId: org.id,
      userId: session.userId,
      role: "super_admin",
    });

    // Root admin is also super_admin (if different from creator)
    if (rootAdmin && rootAdmin.id !== session.userId) {
      await tx.insert(orgMemberships).values({
        orgId: org.id,
        userId: rootAdmin.id,
        role: "super_admin",
      });
    }
  });

  revalidatePath("/organizations");
  redirect(`/${validated.publisherSlug}`);
}

export async function deleteOrganization(formData: FormData) {
  const session = await requireSession();

  const validated = deleteOrganizationSchema.parse({
    orgId: formData.get("orgId"),
  });

  if (!(await canManageOrg(session, validated.orgId))) {
    throw new Error("Forbidden");
  }

  // Remove all access grants for this org, then delete the org (cascades memberships + publishers).
  // Both deletes are wrapped in a transaction so a failure mid-way leaves the DB unchanged.
  await db.transaction(async (tx) => {
    await tx
      .delete(accessGrants)
      .where(
        and(eq(accessGrants.granteeType, "org"), eq(accessGrants.granteeId, validated.orgId))
      );
    await tx.delete(organizations).where(eq(organizations.id, validated.orgId));
  });

  revalidatePath("/organizations");
  redirect("/organizations");
}

export async function addOrgMember(formData: FormData) {
  const session = await requireSession();

  const validated = addOrgMemberSchema.parse({
    orgId: formData.get("orgId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!(await canManageOrg(session, validated.orgId))) {
    throw new Error("Forbidden");
  }

  await db
    .insert(orgMemberships)
    .values({ orgId: validated.orgId, userId: validated.userId, role: validated.role })
    .onConflictDoNothing();

  // Get org publisherSlug for revalidation
  const [org] = await db
    .select({ publisherSlug: organizations.publisherSlug })
    .from(organizations)
    .where(eq(organizations.id, validated.orgId))
    .limit(1);
  if (org) revalidatePath(`/${org.publisherSlug}`);
}

export async function removeOrgMember(formData: FormData) {
  const session = await requireSession();

  const validated = removeOrgMemberSchema.parse({
    membershipId: formData.get("membershipId"),
  });

  const [membership] = await db
    .select({
      orgId: orgMemberships.orgId,
      userId: orgMemberships.userId,
    })
    .from(orgMemberships)
    .where(eq(orgMemberships.id, validated.membershipId))
    .limit(1);

  if (!membership) throw new Error("Membership not found");

  if (!(await canManageOrg(session, membership.orgId))) {
    throw new Error("Forbidden");
  }

  // Find org creator and root admin for protection check
  const [org] = await db
    .select({ creatorId: organizations.creatorId, publisherSlug: organizations.publisherSlug })
    .from(organizations)
    .where(eq(organizations.id, membership.orgId))
    .limit(1);

  const [rootAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isRootAdmin, true))
    .limit(1);

  if (
    isSuperAdminProtected(membership.userId, org?.creatorId ?? null, rootAdmin?.id ?? -1)
  ) {
    throw new Error("Cannot remove protected super_admin");
  }

  await db.delete(orgMemberships).where(eq(orgMemberships.id, validated.membershipId));

  if (org) revalidatePath(`/${org.publisherSlug}`);
}

export async function leaveOrg(formData: FormData) {
  const session = await requireSession();
  const orgId = z.coerce.number().int().positive().parse(formData.get("orgId"));

  const [membership] = await db
    .select({ id: orgMemberships.id, userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, session.userId)))
    .limit(1);

  if (!membership) throw new Error("Not a member");

  const [org] = await db
    .select({ creatorId: organizations.creatorId, publisherSlug: organizations.publisherSlug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [rootAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isRootAdmin, true))
    .limit(1);

  if (isSuperAdminProtected(session.userId, org?.creatorId ?? null, rootAdmin?.id ?? -1)) {
    throw new Error("Protected super_admin cannot leave");
  }

  await db.delete(orgMemberships).where(eq(orgMemberships.id, membership.id));

  if (org) revalidatePath(`/${org.publisherSlug}`);
  redirect("/organizations");
}

export async function updateOrgMemberRole(formData: FormData) {
  const session = await requireSession();

  const validated = updateOrgMemberRoleSchema.parse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });

  const [membership] = await db
    .select({ orgId: orgMemberships.orgId, userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(eq(orgMemberships.id, validated.membershipId))
    .limit(1);

  if (!membership) throw new Error("Membership not found");

  if (!(await canManageOrg(session, membership.orgId))) throw new Error("Forbidden");

  // Admins cannot assign super_admin
  const { getOrgRole } = await import("@/lib/roles");
  const sessionRole = await getOrgRole(session.userId, membership.orgId);
  if (sessionRole === "admin" && validated.role === "super_admin") {
    throw new Error("Admins cannot assign super_admin role");
  }

  // Cannot change protected members
  const [org] = await db
    .select({ creatorId: organizations.creatorId, publisherSlug: organizations.publisherSlug })
    .from(organizations)
    .where(eq(organizations.id, membership.orgId))
    .limit(1);

  const [rootAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isRootAdmin, true))
    .limit(1);

  if (isSuperAdminProtected(membership.userId, org?.creatorId ?? null, rootAdmin?.id ?? -1)) {
    throw new Error("Cannot change role of protected super_admin");
  }

  await db
    .update(orgMemberships)
    .set({ role: validated.role })
    .where(eq(orgMemberships.id, validated.membershipId));

  if (org) revalidatePath(`/${org.publisherSlug}/members`);
}

export async function createUser(formData: FormData) {
  const session = await requireSession();
  if (!session.isRootAdmin) throw new Error("Forbidden");

  const { createUserSchema } = await import("@/lib/validations");
  const { hashPassword } = await import("@/lib/auth");
  const { publisherSlugSchema } = await import("@/lib/validations");

  const validated = createUserSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    publisherSlug: formData.get("publisherSlug"),
  });

  const emailNormalized = validated.email.toLowerCase().trim();

  // Check uniqueness
  const existingEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, emailNormalized))
    .limit(1);
  if (existingEmail.length > 0) redirect("/organizations?error=email_taken");

  const existingSlug = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.slug, validated.publisherSlug))
    .limit(1);
  if (existingSlug.length > 0) redirect("/organizations?error=slug_taken");

  const passwordHash = await hashPassword(validated.password);

  await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        email: emailNormalized,
        passwordHash,
        isRootAdmin: false,
        displayName: validated.displayName,
        publisherSlug: validated.publisherSlug,
      })
      .returning({ id: users.id });

    await tx.insert(publishers).values({
      slug: validated.publisherSlug,
      kind: "user",
      userId: newUser.id,
    });
  });

  revalidatePath("/organizations");
}
