"use server";

import { consumeVerificationToken } from "@/lib/auth";
import { seedOnboardingArticle } from "@/lib/onboarding-seed";
import { redirect } from "next/navigation";

export async function confirmVerification(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    redirect("/login?verified=error");
  }

  const userId = await consumeVerificationToken(token);

  if (!userId) {
    redirect("/login?verified=error");
  }

  // Best-effort seed — never block verification on a seed failure.
  try {
    await seedOnboardingArticle(userId);
  } catch (err) {
    console.error("[onboarding] seed failed for user", userId, err);
  }

  redirect("/login?verified=1");
}
