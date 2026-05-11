"use server"

import { db } from "@/db"
import { userThemes } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { defaultLight, defaultDark } from "@/lib/theme"
import type { ThemeTokens } from "@/db/schema"

const VALID_SCHEMES = ["light", "dark", "system"] as const;
type ColorScheme = typeof VALID_SCHEMES[number];

export async function saveColorSchemePreference(formData: FormData) {
  const pref = formData.get("colorSchemePreference") as string;

  if (!pref || !(VALID_SCHEMES as readonly string[]).includes(pref)) {
    throw new Error("Invalid color scheme preference");
  }

  const session = await getSession();
  if (!session?.userId) throw new Error("Not authenticated");

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(userThemes)
      .set({ colorSchemePreference: pref as ColorScheme })
      .where(eq(userThemes.userId, session.userId));
  } else {
    await db.insert(userThemes).values({
      userId: session.userId,
      lightTokens: defaultLight,
      darkTokens: defaultDark,
      colorSchemePreference: pref as ColorScheme,
    });
  }

  const cookieStore = await cookies();
  cookieStore.set("color-scheme", pref, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}

export async function saveTheme(formData: FormData) {
  const session = await getSession()
  if (!session?.userId) throw new Error("Not authenticated")

  const mode = formData.get("mode") as "light" | "dark"

  const tokens: ThemeTokens = {
    background:       formData.get("background") as string,
    foreground:       formData.get("foreground") as string,
    muted:            formData.get("muted") as string,
    mutedForeground:  formData.get("mutedForeground") as string,
    border:           formData.get("border") as string,
    link:             formData.get("link") as string,
    linkHover:        formData.get("linkHover") as string,
    codeBackground:   formData.get("codeBackground") as string,
    surface:          formData.get("surface") as string,
    surfaceHover:     formData.get("surfaceHover") as string,
    primaryBtn:       formData.get("primaryBtn") as string,
    primaryBtnText:   formData.get("primaryBtnText") as string,
    inputBorder:      formData.get("inputBorder") as string,
    inputFocusBorder: formData.get("inputFocusBorder") as string,
    secondaryText:    formData.get("secondaryText") as string,
  }

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1)

  if (existing[0]) {
    await db
      .update(userThemes)
      .set({
        ...(mode === "light" ? { lightTokens: tokens } : { darkTokens: tokens }),
        updatedAt: new Date(),
      })
      .where(eq(userThemes.userId, session.userId))
  } else {
    await db.insert(userThemes).values({
      userId: session.userId,
      lightTokens: mode === "light" ? tokens : defaultLight,
      darkTokens: mode === "dark" ? tokens : defaultDark,
    })
  }

  revalidatePath("/", "layout")
}

export async function resetTheme(formData: FormData) {
  const session = await getSession()
  if (!session?.userId) throw new Error("Not authenticated")

  const mode = formData.get("mode") as "light" | "dark"

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1)

  if (existing[0]) {
    await db
      .update(userThemes)
      .set({
        ...(mode === "light" ? { lightTokens: defaultLight } : { darkTokens: defaultDark }),
        updatedAt: new Date(),
      })
      .where(eq(userThemes.userId, session.userId))
  }

  revalidatePath("/", "layout")
}
