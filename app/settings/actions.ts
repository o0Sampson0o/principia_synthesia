"use server"

import { db } from "@/db"
import { userThemes } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { defaultLight, defaultDark } from "@/lib/theme"
import { saveThemeSchema } from "@/lib/validations"
import { ZodError } from "zod"

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

  let mode: "light" | "dark";
  let tokens: {
    background: string; foreground: string; muted: string; mutedForeground: string;
    border: string; link: string; linkHover: string; codeBackground: string;
    surface: string; surfaceHover: string; primaryBtn: string; primaryBtnText: string;
    inputBorder: string; inputFocusBorder: string; secondaryText: string;
  };

  try {
    const validated = saveThemeSchema.parse({
      mode: formData.get("mode"),
      tokens: {
        background:       formData.get("background"),
        foreground:       formData.get("foreground"),
        muted:            formData.get("muted"),
        mutedForeground:  formData.get("mutedForeground"),
        border:           formData.get("border"),
        link:             formData.get("link"),
        linkHover:        formData.get("linkHover"),
        codeBackground:   formData.get("codeBackground"),
        surface:          formData.get("surface"),
        surfaceHover:     formData.get("surfaceHover"),
        primaryBtn:       formData.get("primaryBtn"),
        primaryBtnText:   formData.get("primaryBtnText"),
        inputBorder:      formData.get("inputBorder"),
        inputFocusBorder: formData.get("inputFocusBorder"),
        secondaryText:    formData.get("secondaryText"),
      },
    });
    mode = validated.mode;
    tokens = validated.tokens;
  } catch (err) {
    if (err instanceof ZodError) {
      throw new Error("Invalid theme tokens");
    }
    throw err;
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
