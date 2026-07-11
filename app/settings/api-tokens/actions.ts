"use server";

import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { generateApiToken } from "@/lib/api-auth";
import { createApiTokenSchema, revokeApiTokenSchema } from "@/lib/validations";

/**
 * Creates a personal access token for the sync REST API and returns the raw
 * token. The raw value is shown to the user exactly once — only its hash is
 * stored.
 */
export async function createApiToken(formData: FormData): Promise<
  | { ok: true; raw: string; prefix: string }
  | { ok: false; error: string }
> {
  const session = await requireSession();

  const parsed = createApiTokenSchema.safeParse({
    name: formData.get("name"),
    expiresInDays: formData.get("expiresInDays") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { raw, hash, prefix } = generateApiToken();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await db.insert(apiTokens).values({
    userId: session.userId,
    name: parsed.data.name,
    tokenHash: hash,
    prefix,
    expiresAt,
  });

  revalidatePath("/settings/api-tokens");
  return { ok: true, raw, prefix };
}

/** Soft-revokes a token owned by the current user. */
export async function revokeApiToken(formData: FormData): Promise<void> {
  const session = await requireSession();

  const parsed = revokeApiTokenSchema.parse({ tokenId: formData.get("tokenId") });

  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, parsed.tokenId), eq(apiTokens.userId, session.userId)));

  revalidatePath("/settings/api-tokens");
}
