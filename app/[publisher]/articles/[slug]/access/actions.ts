"use server";

import { db } from "@/db";
import { resourceVisibility, accessGrants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertEditRights } from "@/app/[publisher]/articles/actions";
import { z } from "zod";

export async function setArticleVisibility(
  publisherSlug: string,
  articleSlug: string,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);
  const visibility = z
    .enum(["public", "org", "private"])
    .parse(formData.get("visibility"));

  await db
    .insert(resourceVisibility)
    .values({ resourceType: "article", ownerType, ownerId, resourceKey: articleSlug, visibility })
    .onConflictDoUpdate({
      target: [
        resourceVisibility.resourceType,
        resourceVisibility.ownerType,
        resourceVisibility.ownerId,
        resourceVisibility.resourceKey,
      ],
      set: { visibility, updatedAt: new Date() },
    });

  revalidatePath(`/${publisherSlug}/articles/${articleSlug}`);
  revalidatePath(`/${publisherSlug}/articles/${articleSlug}/access`);
}

export async function addArticleGrant(
  publisherSlug: string,
  articleSlug: string,
  formData: FormData
) {
  const { session, ownerType, ownerId } = await assertEditRights(publisherSlug);
  const granteeType = z.enum(["user", "org"]).parse(formData.get("granteeType"));
  const granteeId = z.coerce.number().int().positive().parse(formData.get("granteeId"));

  await db
    .insert(accessGrants)
    .values({
      resourceType: "article",
      ownerType,
      ownerId,
      resourceKey: articleSlug,
      granteeType,
      granteeId,
      grantedBy: session.userId,
    })
    .onConflictDoNothing();

  revalidatePath(`/${publisherSlug}/articles/${articleSlug}/access`);
}

export async function removeArticleGrant(
  publisherSlug: string,
  articleSlug: string,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);
  const grantId = z.coerce.number().int().positive().parse(formData.get("grantId"));

  await db
    .delete(accessGrants)
    .where(
      and(
        eq(accessGrants.id, grantId),
        eq(accessGrants.resourceType, "article"),
        eq(accessGrants.ownerType, ownerType),
        eq(accessGrants.ownerId, ownerId),
        eq(accessGrants.resourceKey, articleSlug)
      )
    );

  revalidatePath(`/${publisherSlug}/articles/${articleSlug}/access`);
}
