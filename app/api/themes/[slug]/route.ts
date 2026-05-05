import { db } from "@/db";
import { userThemes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const result = await db
    .select({ variables: userThemes.variables })
    .from(userThemes)
    .where(eq(userThemes.slug, slug))
    .limit(1);

  if (!result[0]) {
    return new Response("Theme not found", { status: 404 });
  }

  // Return CSS with CSS variables
  const css = `
:root {
  ${result[0].variables}
}
`;

  return new Response(css, {
    headers: {
      "Content-Type": "text/css",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
