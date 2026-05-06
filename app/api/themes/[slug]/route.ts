import { db } from "@/db";
import { userThemes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildThemeStyle, defaultLight, defaultDark } from "@/lib/theme";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // slug is the user email
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, slug))
    .limit(1);

  if (!user[0]) {
    return new Response("User not found", { status: 404 });
  }

  const result = await db
    .select({ lightTokens: userThemes.lightTokens, darkTokens: userThemes.darkTokens })
    .from(userThemes)
    .where(eq(userThemes.userId, user[0].id))
    .limit(1);

  const light = { ...defaultLight, ...result[0]?.lightTokens };
  const dark  = { ...defaultDark,  ...result[0]?.darkTokens };
  const css   = buildThemeStyle(light, dark);

  return new Response(css, {
    headers: {
      "Content-Type": "text/css",
      "Cache-Control": "no-store",
    },
  });
}
