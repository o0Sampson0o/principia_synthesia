"use server";

import { consumeVerificationToken } from "@/lib/auth";
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

  redirect("/login?verified=1");
}
