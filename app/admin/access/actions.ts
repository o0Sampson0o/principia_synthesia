"use server";

import { db } from "@/db";
import {
  resourceVisibility,
  accessGrants,
  organizations,
  orgMemberships,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, hashPassword } from "@/lib/auth";
import {
  setVisibilitySchema,
  addAccessGrantSchema,
  removeAccessGrantSchema,
  createOrganizationSchema,
  deleteOrganizationSchema,
  addOrgMemberSchema,
  removeOrgMemberSchema,
  createUserSchema,
} from "@/lib/validations";

async function requireAdmin() {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Unauthorized");
  return session;
}

export async function setResourceVisibility(formData: FormData) {
  await requireAdmin();
  const validated = setVisibilitySchema.parse({
    resourceType: formData.get("resourceType"),
    resourceKey: formData.get("resourceKey"),
    isPrivate: formData.get("isPrivate") === "true",
  });

  const existing = await db
    .select({ id: resourceVisibility.id })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, validated.resourceType),
        eq(resourceVisibility.resourceKey, validated.resourceKey)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(resourceVisibility)
      .set({ isPrivate: validated.isPrivate, updatedAt: new Date() })
      .where(eq(resourceVisibility.id, existing[0].id));
  } else {
    await db.insert(resourceVisibility).values({
      resourceType: validated.resourceType,
      resourceKey: validated.resourceKey,
      isPrivate: validated.isPrivate,
    });
  }

  if (validated.resourceType === "book") {
    revalidatePath(`/curriculum/${validated.resourceKey}`);
    revalidatePath(`/admin/curriculum/${validated.resourceKey}/access`);
  } else {
    revalidatePath(`/${validated.resourceKey}`);
  }
  revalidatePath("/");
}

export async function addAccessGrant(formData: FormData) {
  const session = await requireAdmin();
  const validated = addAccessGrantSchema.parse({
    resourceType: formData.get("resourceType"),
    resourceKey: formData.get("resourceKey"),
    granteeType: formData.get("granteeType"),
    granteeId: formData.get("granteeId"),
  });

  await db
    .insert(accessGrants)
    .values({
      resourceType: validated.resourceType,
      resourceKey: validated.resourceKey,
      granteeType: validated.granteeType,
      granteeId: validated.granteeId,
      grantedBy: session.userId,
    })
    .onConflictDoNothing();

  if (validated.resourceType === "book") {
    revalidatePath(`/admin/curriculum/${validated.resourceKey}/access`);
  }
}

export async function removeAccessGrant(formData: FormData) {
  await requireAdmin();
  const validated = removeAccessGrantSchema.parse({
    grantId: formData.get("grantId"),
  });

  const grant = await db
    .select({ resourceType: accessGrants.resourceType, resourceKey: accessGrants.resourceKey })
    .from(accessGrants)
    .where(eq(accessGrants.id, validated.grantId))
    .limit(1);

  await db.delete(accessGrants).where(eq(accessGrants.id, validated.grantId));

  if (grant[0]?.resourceType === "book") {
    revalidatePath(`/admin/curriculum/${grant[0].resourceKey}/access`);
  }
}

export async function createOrganization(formData: FormData) {
  await requireAdmin();
  const validated = createOrganizationSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  await db.insert(organizations).values({
    name: validated.name,
    slug: validated.slug,
  });

  revalidatePath("/admin/access/orgs");
  redirect(`/admin/access/orgs/${validated.slug}`);
}

export async function deleteOrganization(formData: FormData) {
  await requireAdmin();
  const validated = deleteOrganizationSchema.parse({
    orgId: formData.get("orgId"),
  });

  await db.delete(accessGrants).where(
    and(eq(accessGrants.granteeType, "org"), eq(accessGrants.granteeId, validated.orgId))
  );
  await db.delete(organizations).where(eq(organizations.id, validated.orgId));

  revalidatePath("/admin/access/orgs");
  redirect("/admin/access/orgs");
}

export async function addOrgMember(formData: FormData) {
  await requireAdmin();
  const validated = addOrgMemberSchema.parse({
    orgId: formData.get("orgId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  await db
    .insert(orgMemberships)
    .values({
      orgId: validated.orgId,
      userId: validated.userId,
      role: validated.role,
    })
    .onConflictDoNothing();

  const org = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, validated.orgId))
    .limit(1);
  if (org[0]) revalidatePath(`/admin/access/orgs/${org[0].slug}`);
}

export async function removeOrgMember(formData: FormData) {
  await requireAdmin();
  const validated = removeOrgMemberSchema.parse({
    membershipId: formData.get("membershipId"),
  });

  const membership = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.id, validated.membershipId))
    .limit(1);

  await db.delete(orgMemberships).where(eq(orgMemberships.id, validated.membershipId));

  if (membership[0]) {
    const org = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, membership[0].orgId))
      .limit(1);
    if (org[0]) revalidatePath(`/admin/access/orgs/${org[0].slug}`);
  }
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const validated = createUserSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const passwordHash = await hashPassword(validated.password);
  await db.insert(users).values({
    email: validated.email,
    passwordHash,
    isAdmin: false,
  });

  revalidatePath("/admin/access/users");
}
