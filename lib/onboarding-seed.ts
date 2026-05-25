import { db } from "@/db";
import { users, articles, resourceVisibility } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notify } from "@/lib/notifications";

const WELCOME_SLUG = "article-welcome-to-principia";
const WELCOME_TITLE = "Welcome to Principia Synthesia";

const WELCOME_CONTENT = `---
status: published
tags: ["welcome","getting-started"]
description: "A quick tour of what you can do with Principia Synthesia."
canvas: null
---

Welcome to **Principia Synthesia** — your personal textbook of everything.

This is your private welcome article. Only you can see it (visibility is set to *private*). Feel free to edit, rename, or delete it.

A few things to try:

- **Inline animations.** Embed a runnable animation with the syntax \`[[anim-name]]\`. Create one under your publisher, then drop it anywhere in your MDX.
- **Wikilinks.** Connect ideas with double-bracket links like [[article-another-idea]]. They become first-class internal references.
- **Frontmatter.** Tags, descriptions and status live at the top of every article (see above). They power search, related events, and the homepage.
- **Books.** Collect articles into ordered curricula by setting a *book slug* in the editor.

When you're ready, hit **New article** in your profile to start writing.
`;

/**
 * Seed the welcome article and onboarding notification for a newly-verified user.
 *
 * Idempotent: returns early if the user already has any articles, OR if an article
 * with the welcome slug already exists for this publisher.
 *
 * Writes:
 *   - one row into `articles` (status published, ownerType='user', ownerId=userId)
 *   - one row into `resource_visibility` (private)
 *   - one row into `notifications` (type 'onboarding_example_article')
 */
export async function seedOnboardingArticle(userId: number): Promise<void> {
  const [user] = await db
    .select({ id: users.id, publisherSlug: users.publisherSlug })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  const [existingAny] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.ownerType, "user"), eq(articles.ownerId, userId)))
    .limit(1);
  if (existingAny) return;

  const [existingSlug] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, "user"),
        eq(articles.ownerId, userId),
        eq(articles.slug, WELCOME_SLUG),
      ),
    )
    .limit(1);
  if (existingSlug) return;

  const now = new Date();

  const [created] = await db
    .insert(articles)
    .values({
      slug: WELCOME_SLUG,
      title: WELCOME_TITLE,
      content: WELCOME_CONTENT,
      summary: "A short tour of what Principia Synthesia can do.",
      ownerType: "user",
      ownerId: userId,
      metadata: {
        status: "published",
        tags: ["welcome", "getting-started"],
        description: "A quick tour of what you can do with Principia Synthesia.",
        canvas: null,
      },
      lastVerifiedAt: now,
    })
    .returning({ id: articles.id });

  await db.insert(resourceVisibility).values({
    resourceType: "article",
    ownerType: "user",
    ownerId: userId,
    resourceKey: WELCOME_SLUG,
    visibility: "private",
  });

  await notify(userId, "onboarding_example_article", {
    articleId: created.id,
    publisherSlug: user.publisherSlug,
    slug: WELCOME_SLUG,
    title: WELCOME_TITLE,
  });
}
