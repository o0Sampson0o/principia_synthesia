"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { completeOnboardingSchema } from "@/lib/validations";

/**
 * Mark the current user's onboarding tour as completed (or skipped).
 * Idempotent: writes `onboardingCompletedAt = NOW()` only if currently null.
 */
export async function completeOnboarding(formData: FormData): Promise<void> {
  const session = await requireSession();

  completeOnboardingSchema.parse({
    outcome: formData.get("outcome") ?? "completed",
  });

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(users.id, session.userId));

  revalidatePath("/", "layout");
}

/**
 * Clears the user's onboarding flag so the tour will be shown again
 * on next page load. Called by the "Replay tour" button.
 */
export async function resetOnboarding(): Promise<void> {
  const session = await requireSession();

  await db
    .update(users)
    .set({ onboardingCompletedAt: null })
    .where(eq(users.id, session.userId));

  revalidatePath("/", "layout");
  revalidatePath("/settings/onboarding");
}
