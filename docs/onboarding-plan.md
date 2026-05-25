# Onboarding System — Implementation Plan

## 1. Overview

This plan adds a two-pillar onboarding system to Principia Synthesia for newly-verified users:

1. **Interactive 4-step tour** — a custom React tour component (no third-party library) mounted in the root layout that anchors tooltips to `data-tour` attributes on existing UI elements. Triggered automatically on first authenticated page load after email verification, dismissible, and replayable from `/settings/onboarding`.
2. **Auto-generated example article** — a private "Welcome to Principia Synthesia" MDX article (slug `article-welcome-to-principia`) seeded into the user's publisher during the email-verification action, paired with a new in-app notification (`onboarding_example_article`) so the bell announces it.

State is tracked via a new `onboardingCompletedAt` timestamp column on `users` (null = pending). The tour is driven from `app/layout.tsx`, which already loads `getSession()` and fetches user data, so the additional column adds zero network round-trips.

---

## 2. Assumptions

These are decisions I made where the original description was ambiguous. They are written here so anyone executing this plan can override them up-front if desired.

1. **Tour trigger**: the tour appears on the *first server-rendered page load* after the verify-email action redirects to `/login?verified=1`, then through to any signed-in page. Detection: `session.userId` is set AND `users.emailVerifiedAt IS NOT NULL` AND `users.onboardingCompletedAt IS NULL`.
2. **Tour navigation**: the tour does **not** auto-navigate the user between routes. Each step targets an element. If the element isn't on the page, the step renders a neutral fallback popover at the top-center of the viewport with a "Take me there" link to the relevant route, then advances on click.
3. **Storage of "in-progress" state**: ephemeral, kept in component state only. Refreshing the page restarts the tour at step 1 (still under the same "pending" flag). This avoids a per-step server round-trip; only the terminal complete/skip writes to the DB.
4. **Example article ownership**: created with `ownerType='user'` and `ownerId = newUser.id`. Visibility is `private` via the `resourceVisibility` table (which is also the layer the article-access page already uses).
5. **Idempotency for the example article**: the seed function is wrapped in a guard that returns early if either (a) any article already exists for that publisher, OR (b) an article with slug `article-welcome-to-principia` already exists for that publisher. This keeps reruns (e.g. a user clicking the verification link twice) safe.
6. **The example article is created at verify-email time** (in `confirmVerification`), *not* at signup. Signup happens before the user has actually proven email ownership; seeding then would litter the DB with content for unverified accounts.
7. **The `onboarding_example_article` notification deep-links to** `/<publisherSlug>/articles/article-welcome-to-principia`.
8. **No additional client-side storage** (no `localStorage`). All "have we shown this" state lives in the DB column so it works across devices.
9. **Tour visibility**: the tour is only shown on desktop widths (≥ md / 768px). On mobile, where the editor toolbar and nav are collapsed behind the hamburger, the tour is silently suppressed and `onboardingCompletedAt` is *not* written — the user will see it on their first desktop visit.
10. **The `NotificationsBell` is gated by `NEXT_PUBLIC_ENABLE_NOTIFICATIONS`**. The onboarding notification will only render when that flag is true (as with all other notifications). The example article itself will still be created regardless.

---

## 3. Architecture & Design Decisions

### 3.1 Tour component
- Plain React 19 client component (`components/OnboardingTour.tsx`) with no third-party dependencies.
- Anchored to `data-tour="<id>"` selectors on existing elements. The component queries the DOM (`document.querySelector('[data-tour="..."]')`) on each step, gets the element's `getBoundingClientRect()`, and positions a fixed-position popover beside it.
- Uses a full-viewport dimmer overlay (`fixed inset-0 bg-black/40 z-40`) plus a "cutout" by giving the target a `box-shadow: 0 0 0 9999px rgba(0,0,0,0.4)` via a temporary class, which is cheaper than SVG masking and works with any background.
- The popover has the existing themed classes (`themed-surface`, `themed-border`, `themed-heading`, `themed-btn-primary`, `themed-btn-ghost`).
- Re-renders on `window.resize` (with `requestAnimationFrame` throttling) and re-queries on every step change.
- Mounted via a small server component wrapper (`components/OnboardingTourGate.tsx`) in `app/layout.tsx`, which decides whether to render the tour at all based on the user's onboarding flag. This keeps the gating logic on the server (no extra fetch from the client).

### 3.2 Why a server gate, not a client check
The root layout already runs `getSession()` and fetches user data for the email-verification banner — we piggyback on the same query, adding `onboardingCompletedAt` to the existing select. Zero extra round-trips.

### 3.3 Notification type extension
The `notifications.type` column is free-text TEXT (see `db/schema.ts:567`), so adding `onboarding_example_article` requires no schema migration — only:
- a new literal in the `NotificationType` union in `lib/notifications.ts`
- new payload type
- new branches in `notificationHref` and `notificationLabel` in `components/NotificationsBell.tsx`
- the same branches in `app/notifications/page.tsx` if it renders types explicitly

### 3.4 Example article: stored as MDX inside `articles.content`
No new code path: the article is created with the same shape that `createArticle` would produce. The seed function inserts directly into `articles` and `resourceVisibility` (rather than calling `createArticle`) because:
- `createArticle` requires a logged-in `requireSession()` and `assertEditRights()` — fine at verify time, but it also calls `redirect()` which would interrupt the verification flow.
- `createArticle` runs citation sync, category sync, and snapshot-on-publish — none of those are needed for the welcome article.
- The seed is allowed to write a `parsed.metadata` block with `status: "published"` so the article is immediately visible to the user (it's still `private` via visibility, so nobody else sees it).

---

## 4. Database Changes

### 4.1 New column on `users`
Add `onboardingCompletedAt` (nullable timestamp). Null = not yet completed.

### 4.2 Drizzle schema edit
File: `db/schema.ts` — in the `users` table definition (around lines 48–58), add:

```ts
onboardingCompletedAt: timestamp("onboarding_completed_at"),
```

The full updated table:

```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  isRootAdmin: boolean("is_root_admin").default(false).notNull(),
  displayName: text("display_name").notNull().default(""),
  publisherSlug: text("publisher_slug").unique().notNull().default(""),
  emailVerifiedAt: timestamp("email_verified_at"),
  verificationTokenHash: text("verification_token_hash"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
});
```

### 4.3 Raw SQL migration
Create `drizzle/0012_onboarding.sql` with the contents:

```sql
-- Track when a user has finished (or skipped) the onboarding tour.
-- NULL = onboarding not yet completed. Set by completeOnboarding() server action
-- when the user clicks "Done" or "Skip" on the tour.
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;
```

### 4.4 Applying the migration
Per project convention (manual psql, no `drizzle-kit generate`):

```bash
psql "$POSTGRES_URL" -f drizzle/0012_onboarding.sql
```

Confirm `.env.local` points at localhost before running (per repo memory).

### 4.5 No new tables
The notification uses the existing `notifications` table. The article uses the existing `articles` and `resourceVisibility` tables. No new schema entities required beyond the single column.

---

## 5. Validation Schemas

Add to `lib/validations.ts` (after the existing `markNotificationReadSchema`, around line 591):

```ts
// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/**
 * Validates input for completing or skipping the onboarding tour.
 * `outcome` is recorded only for analytics — both values write the same DB column.
 */
export const completeOnboardingSchema = z.object({
  outcome: z.enum(["completed", "skipped"]),
});

/**
 * Validates input for resetting the onboarding flag (used by the
 * "Replay tour" button on /settings/onboarding).
 */
export const resetOnboardingSchema = z.object({}).optional();
```

---

## 6. Server Actions

Create a new file: `app/settings/onboarding/actions.ts`.

```ts
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
```

### 6.1 Verify-email action update
Edit `app/verify-email/[token]/actions.ts` to call the new seed function on success. The current action returns to `/login?verified=1` after `consumeVerificationToken`; insert the seed call between consume and redirect.

```ts
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
```

### 6.2 New seed helper
Create `lib/onboarding-seed.ts`:

```ts
import { db } from "@/db";
import { users, articles, resourceVisibility } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notify } from "@/lib/notifications";

const WELCOME_SLUG = "article-welcome-to-principia";
const WELCOME_TITLE = "Welcome to Principia Synthesia";

/** ~150-word MDX showcasing frontmatter, an animation embed, a wikilink, and tags. */
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

  // Guard: skip if user already has any articles
  const [existingAny] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.ownerType, "user"), eq(articles.ownerId, userId)))
    .limit(1);
  if (existingAny) return;

  // Belt-and-braces guard on slug uniqueness
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

  // Private visibility so nobody else sees it
  await db.insert(resourceVisibility).values({
    resourceType: "article",
    ownerType: "user",
    ownerId: userId,
    resourceKey: WELCOME_SLUG,
    visibility: "private",
  });

  // Notification (uses existing notify() helper — payload shape registered in lib/notifications.ts)
  await notify(userId, "onboarding_example_article" as never, {
    articleId: created.id,
    publisherSlug: user.publisherSlug,
    slug: WELCOME_SLUG,
    title: WELCOME_TITLE,
  } as never);
}
```

### 6.3 Notification type extension
Edit `lib/notifications.ts`:

```ts
// Extend the union (around line 10)
export type NotificationType =
  | "stale_articles_digest"
  | "article_forked"
  | "article_cited"
  | "onboarding_example_article";

// New payload type (add after ArticleCitedPayload)
export type OnboardingExampleArticlePayload = {
  articleId: number;
  publisherSlug: string;
  slug: string;
  title: string;
};

// Extend the NotificationPayload union
export type NotificationPayload =
  | StaleArticlesDigestPayload
  | ArticleForkedPayload
  | ArticleCitedPayload
  | OnboardingExampleArticlePayload;
```

Remove the `as never` casts from `seedOnboardingArticle` once the union is updated.

---

## 7. API Routes

**No new API routes required.** The tour writes through the server action `completeOnboarding`; the notification is fetched via the existing `/api/notifications/list` and `/api/notifications/unread-count`.

---

## 8. UI Components & Pages

### 8.1 `components/OnboardingTour.tsx` (client component, new)

A self-contained, dependency-free tour component. Skeleton:

```ts
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/app/settings/onboarding/actions";
import { useRouter, usePathname } from "next/navigation";

type Step = {
  id: string;          // matches data-tour="..."
  title: string;
  body: string;
  // Optional fallback route the user can click to navigate to a page
  // that contains the target.
  fallbackRoute?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    id: "new-article-button",
    title: "Create your first article",
    body: "Use the New article button on your publisher page to start writing. Articles support MDX, math, animations, and wikilinks.",
    fallbackRoute: { label: "Go to my publisher", href: "" }, // filled at runtime from props
  },
  {
    id: "editor-content",
    title: "Embed animations with [[anim-…]]",
    body: "Inside the editor, type [[anim-slug]] to embed any animation you have created under your publisher. They render live in the article.",
    fallbackRoute: { label: "Open new article form", href: "" },
  },
  {
    id: "frontmatter-panel",
    title: "Frontmatter & book slug",
    body: "Open the Frontmatter section to set tags, description, and the canvas (book slug) that groups this article into a curriculum.",
    fallbackRoute: { label: "Open new article form", href: "" },
  },
  {
    id: "article-access-link",
    title: "Control who can see your work",
    body: "From any article's edit page, the Access & visibility link lets you choose public, organisation-only, or private — with explicit grants.",
    fallbackRoute: { label: "Open my publisher", href: "" },
  },
];

export default function OnboardingTour({ publisherSlug }: { publisherSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isPending, startTransition] = useTransition();
  const targetRef = useRef<HTMLElement | null>(null);

  // Suppress on small viewports
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  // Re-query target on step or route change
  useEffect(() => {
    if (!enabled) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[stepIndex].id}"]`);
    targetRef.current = el;
    setRect(el?.getBoundingClientRect() ?? null);

    if (el) el.classList.add("tour-highlight");
    return () => { el?.classList.remove("tour-highlight"); };
  }, [stepIndex, enabled, pathname]);

  // Update on resize/scroll
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setRect(targetRef.current?.getBoundingClientRect() ?? null);
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [enabled]);

  if (!enabled) return null;

  const step = STEPS[stepIndex];

  function finish(outcome: "completed" | "skipped") {
    const fd = new FormData();
    fd.set("outcome", outcome);
    startTransition(async () => {
      await completeOnboarding(fd);
    });
  }

  function next() {
    if (stepIndex === STEPS.length - 1) finish("completed");
    else setStepIndex((i) => i + 1);
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  // Resolve fallback hrefs that depend on publisherSlug
  const fallback = step.fallbackRoute && {
    ...step.fallbackRoute,
    href:
      step.id === "new-article-button" ? `/${publisherSlug}` :
      step.id === "editor-content" || step.id === "frontmatter-panel" ? `/${publisherSlug}/articles/new` :
      `/${publisherSlug}`,
  };

  // Position: prefer right of target, fall back to centered if no rect
  const popoverStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: Math.max(16, rect.top),
        left: Math.min(window.innerWidth - 360, rect.right + 12),
        width: 320,
        zIndex: 60,
      }
    : {
        position: "fixed",
        top: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: 360,
        zIndex: 60,
      };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        className="themed-surface themed-border border rounded-lg shadow-lg p-4"
        style={popoverStyle}
      >
        <p className="text-xs themed-muted mb-1">Step {stepIndex + 1} of {STEPS.length}</p>
        <h2 id="onboarding-tour-title" className="text-base font-semibold themed-heading mb-2">{step.title}</h2>
        <p className="text-sm themed-secondary mb-4">{step.body}</p>

        {!rect && fallback && (
          <button
            type="button"
            onClick={() => router.push(fallback.href)}
            className="text-sm themed-link mb-3 block"
          >
            {fallback.label} →
          </button>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => finish("skipped")}
            disabled={isPending}
            className="themed-btn-ghost text-xs"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={back} disabled={isPending} className="themed-btn-ghost text-sm">
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={isPending} className="themed-btn-primary text-sm">
              {stepIndex === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
```

### 8.2 `components/OnboardingTourGate.tsx` (server component, new)

```ts
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import OnboardingTour from "./OnboardingTour";

/**
 * Decides whether to mount the OnboardingTour client component.
 * Renders nothing for guests, unverified users, and users who have
 * already finished or skipped onboarding.
 */
export default async function OnboardingTourGate() {
  const session = await getSession();
  if (!session) return null;

  const [u] = await db
    .select({
      emailVerifiedAt: users.emailVerifiedAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
      publisherSlug: users.publisherSlug,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!u || !u.emailVerifiedAt || u.onboardingCompletedAt) return null;

  return <OnboardingTour publisherSlug={u.publisherSlug} />;
}
```

> **Optimization note:** the `app/layout.tsx` Promise.all already fetches `emailVerifiedAt`. Optionally inline `OnboardingTourGate`'s query into that Promise.all and pass `onboardingCompletedAt` + `publisherSlug` directly to `<OnboardingTour />` as props. Either approach is acceptable; the separate gate file keeps `layout.tsx` smaller.

### 8.3 `app/layout.tsx` — mount the gate
Edit `app/layout.tsx` to import and render the gate alongside the email-verification banner:

```ts
import OnboardingTourGate from "@/components/OnboardingTourGate";

// ...inside the <body>, after children:
{children}
<OnboardingTourGate />
<Footer />
```

### 8.4 `app/settings/onboarding/page.tsx` (new) — Replay tour

```ts
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resetOnboarding } from "./actions";

export default async function OnboardingSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [u] = await db
    .select({ onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight themed-heading mb-2">Onboarding</h1>
        <p className="text-sm themed-muted">
          The product tour appears once for new accounts. You can replay it any time.
        </p>
      </header>

      <hr className="themed-border mb-8" />

      <section>
        <p className="text-sm themed-secondary mb-4">
          {u?.onboardingCompletedAt
            ? `You completed the tour on ${new Date(u.onboardingCompletedAt).toLocaleDateString()}.`
            : "You have not finished the tour yet."}
        </p>
        <form action={resetOnboarding}>
          <button type="submit" className="themed-btn-primary">
            Replay tour
          </button>
        </form>
      </section>
    </main>
  );
}
```

### 8.5 Add `data-tour` attributes to existing UI

Edit each file to add the attribute exactly as shown. These IDs are referenced by `STEPS` in `OnboardingTour.tsx`.

- **`app/[publisher]/page.tsx`** — locate the "New article" link/button and add `data-tour="new-article-button"`.
  *(If no such button exists on the publisher landing page, add the attribute to the link or call-to-action that points users at `/{publisher}/articles/new`. Otherwise, add it to the link in the publisher's articles index `app/[publisher]/articles/page.tsx`.)*

- **`components/ContentEditor.tsx`** — wrap the root container with `data-tour="editor-content"` (added to the outermost element of the editor).

- **`components/FrontmatterPanel.tsx`** — add `data-tour="frontmatter-panel"` to the `<details>` element on line 75.

- **`app/[publisher]/articles/[slug]/edit/page.tsx`** — the existing `Link` to `…/access` on lines 72–77 already exists; add `data-tour="article-access-link"` to that `Link`.

These four attributes are the only DOM changes required outside of the new components.

### 8.6 `app/globals.css` — tour highlight class
Append the tour overlay/highlight rule (uses Tailwind's CSS variables for theming where possible):

```css
/* Onboarding tour: target highlight ring + above-overlay z-index */
.tour-highlight {
  position: relative;
  z-index: 50;
  box-shadow: 0 0 0 4px rgb(59 130 246 / 0.6),
              0 0 0 9999px rgb(0 0 0 / 0.4);
  border-radius: 6px;
  transition: box-shadow 0.15s ease-out;
}
```

The `box-shadow: 0 0 0 9999px` trick creates the dark-overlay "cutout" effect without SVG. The `<div className="fixed inset-0 bg-black/40 z-40">` in `OnboardingTour` is therefore unnecessary when a target is present — it is only rendered as a fallback when `rect === null` (no target found). Update `OnboardingTour.tsx` accordingly: `{!rect && <div className="fixed inset-0 bg-black/40 z-40" aria-hidden="true" />}`.

### 8.7 Extend `NotificationsBell` for the new type
Edit `components/NotificationsBell.tsx`:

```ts
// In notificationHref (~line 15)
if (n.type === "onboarding_example_article") {
  return `/${p.publisherSlug}/articles/${p.slug}`;
}

// In notificationLabel (~line 27)
if (n.type === "onboarding_example_article") {
  return `Welcome! Your example article "${p.title}" is ready.`;
}
```

### 8.8 Extend `/notifications` page if needed
Inspect `app/notifications/page.tsx`. If it has a type-aware renderer, add the same `onboarding_example_article` case. If it just lists `type` and `payload`, no edit needed.

### 8.9 Add nav link to `/settings/onboarding`
Edit `components/NavClient.tsx` to include a settings sub-item. Minimal change — add to both the desktop and mobile menus alongside `/settings/theme`:

```tsx
<Link href="/settings/onboarding" className="themed-nav-link">
  Onboarding
</Link>
```

(Optional: bundle settings links into a dropdown. Out of scope for this plan.)

---

## 9. Routing

| Route                          | Method | Auth                  | Notes                                                  |
|--------------------------------|--------|-----------------------|--------------------------------------------------------|
| `/settings/onboarding`         | GET    | Requires session      | Renders the Replay-tour page                           |
| `/settings/onboarding` (form)  | POST   | Requires session      | Calls `resetOnboarding` server action                  |

No new API routes; no middleware changes. The route lives under `/settings`, which is in `RESERVED_SLUGS` (validations.ts line 12) so it cannot collide with a publisher slug.

---

## 10. Middleware / Auth Changes

**None.** `middleware.ts` already protects the relevant routes and the onboarding actions use the existing `requireSession()` helper.

---

## 11. Tests

All tests follow the patterns already used in `tests/actions/signup-actions.test.ts` (vi.hoisted mocks, drizzle chain mocks, NEXT_REDIRECT-throw shim).

### 11.1 `tests/lib/onboarding-seed.test.ts` (new)
Environment: `node`. Mocks `@/db` and `@/lib/notifications`.

Covers:
- Inserts article + visibility row + notification when no existing articles.
- Returns early (no inserts) when user already has articles.
- Returns early (no inserts) when an article with the welcome slug already exists.
- Returns early (no inserts) when `users` row not found.
- Verifies the notification is called with type `onboarding_example_article` and correct payload shape.

### 11.2 `tests/actions/verify-email-actions.test.ts` (new)
Environment: `node`. Mocks `@/lib/auth` (`consumeVerificationToken`), `@/lib/onboarding-seed` (`seedOnboardingArticle`), `next/navigation` (`redirect`).

Covers:
- Successful verification calls `seedOnboardingArticle` with the returned userId, then redirects to `/login?verified=1`.
- Verification failure (consume returns null) redirects to `/login?verified=error` and does NOT call seed.
- A throw inside `seedOnboardingArticle` is swallowed (console.error spy) and the user is still redirected to `/login?verified=1`.

### 11.3 `tests/actions/onboarding-actions.test.ts` (new)
Environment: `node`. Mocks `@/db`, `@/lib/auth` (`requireSession`), `next/cache` (`revalidatePath`).

Covers:
- `completeOnboarding` with `outcome=completed` updates the users row with current timestamp scoped to `session.userId`.
- `completeOnboarding` with `outcome=skipped` likewise.
- `completeOnboarding` with an invalid `outcome` throws ZodError before touching the DB.
- `resetOnboarding` sets `onboardingCompletedAt = null` scoped to `session.userId`.
- Both call `revalidatePath`.

### 11.4 `tests/components/OnboardingTour.test.tsx` (new)
Environment: `jsdom` (default). Render with `@testing-library/react`. Mocks `next/navigation` (`useRouter`, `usePathname`), `@/app/settings/onboarding/actions` (`completeOnboarding`).

Covers:
- With a target element present in the DOM (insert via `document.body.innerHTML`), the popover appears anchored to it and the highlight class is applied.
- Clicking "Skip tour" calls `completeOnboarding` with FormData containing `outcome=skipped`.
- Clicking "Next" four times calls `completeOnboarding` with `outcome=completed` on the final click.
- "Back" decrements the step counter and re-queries the next data-tour element.
- When the target is missing, the popover falls back to centered position and shows the `fallbackRoute` link; clicking it calls `router.push` with the expected href derived from `publisherSlug`.
- On a viewport narrower than 768px (mock `matchMedia`), nothing is rendered.

### 11.5 `tests/components/OnboardingTourGate.test.tsx` (new)
Environment: `node`. Mocks `@/lib/auth` (`getSession`) and `@/db`. Renders the async server component by awaiting it.

Covers:
- Returns `null` when `getSession` is `null`.
- Returns `null` when `emailVerifiedAt` is null.
- Returns `null` when `onboardingCompletedAt` is non-null.
- Returns the `<OnboardingTour publisherSlug={...} />` element when all conditions met.

### 11.6 `tests/components/NotificationsBell.test.tsx` (extend existing, or new if absent)
Add cases for `onboarding_example_article`:
- `notificationHref` returns `/${publisherSlug}/articles/${slug}`.
- `notificationLabel` returns the expected welcome message.

Since these are pure functions inside the component but the component itself fetches via `fetch`, the easiest approach is to extract `notificationHref` and `notificationLabel` to a sibling helper module (`components/NotificationsBell.helpers.ts`) and unit-test them there. *Optional refactor — only do it if there is no existing test file for these helpers.*

### 11.7 Test pattern reminders
- All node-environment tests must include `// @vitest-environment node` at the top.
- `vi.hoisted(() => vi.fn())` for every mock variable referenced inside `vi.mock()` factories.
- Drizzle chain mocks: `mockReturnValue` for intermediate steps (`.select().from().where()`) and `mockResolvedValue` for the terminal (`.limit()` / `.returning()`).
- `redirect` mocked to `throw new Error("NEXT_REDIRECT")`, then assert with `await expect(...).rejects.toThrow("NEXT_REDIRECT")`.

---

## 12. Implementation Order

Each step is independently executable; commit after each block.

1. **Schema + migration**
   1. Edit `db/schema.ts` to add `onboardingCompletedAt` to `users`.
   2. Create `drizzle/0012_onboarding.sql`.
   3. Apply the migration to local DB (confirm `.env.local` is localhost first).

2. **Validation schemas**
   4. Add `completeOnboardingSchema` and `resetOnboardingSchema` to `lib/validations.ts`.

3. **Notification type extension**
   5. Extend `NotificationType`, add `OnboardingExampleArticlePayload`, extend `NotificationPayload` in `lib/notifications.ts`.

4. **Seed helper**
   6. Create `lib/onboarding-seed.ts` with `seedOnboardingArticle`.
   7. Write `tests/lib/onboarding-seed.test.ts` and run it green.

5. **Wire seed into verify-email**
   8. Edit `app/verify-email/[token]/actions.ts` to call `seedOnboardingArticle` (best-effort) before redirect.
   9. Write `tests/actions/verify-email-actions.test.ts` and run it green.

6. **Onboarding server actions**
   10. Create `app/settings/onboarding/actions.ts` with `completeOnboarding` + `resetOnboarding`.
   11. Write `tests/actions/onboarding-actions.test.ts` and run it green.

7. **Tour gate + tour component**
   12. Create `components/OnboardingTour.tsx`.
   13. Create `components/OnboardingTourGate.tsx`.
   14. Add the `.tour-highlight` CSS rule to `app/globals.css`.
   15. Mount `<OnboardingTourGate />` inside `<body>` in `app/layout.tsx` (after `{children}`, before `<Footer />`).

8. **`data-tour` attributes**
   16. Add `data-tour="new-article-button"` to the "New article" link/button on the publisher landing page (`app/[publisher]/page.tsx` or `app/[publisher]/articles/page.tsx`).
   17. Add `data-tour="editor-content"` to the outermost element of `components/ContentEditor.tsx`.
   18. Add `data-tour="frontmatter-panel"` to the `<details>` in `components/FrontmatterPanel.tsx` (line 75).
   19. Add `data-tour="article-access-link"` to the `Link` in `app/[publisher]/articles/[slug]/edit/page.tsx` (lines 72–77).

9. **Notifications surface**
   20. Add `onboarding_example_article` branches to `notificationHref` and `notificationLabel` in `components/NotificationsBell.tsx`.
   21. (If applicable) Add the same case to `app/notifications/page.tsx`.

10. **Settings page**
    22. Create `app/settings/onboarding/page.tsx`.
    23. Add a `/settings/onboarding` link to `components/NavClient.tsx` (desktop and mobile).

11. **Tour + gate tests**
    24. Write `tests/components/OnboardingTour.test.tsx` and run it green.
    25. Write `tests/components/OnboardingTourGate.test.tsx` and run it green.

12. **Manual QA pass**
    26. Sign up a fresh user, click the verification link, sign in. Confirm:
        - Welcome article exists at `/{publisherSlug}/articles/article-welcome-to-principia`.
        - Notification bell shows the welcome message (if `NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true`).
        - Tour appears, walks through 4 steps, completes.
        - `users.onboarding_completed_at` is no longer null.
        - Visiting `/settings/onboarding` shows completion date; clicking "Replay tour" reshows it.
    27. Sign up a second user with `< md` viewport; confirm tour is suppressed and column stays null.

---

## 13. Potential Pitfalls

1. **Verify-email race**: the seed runs *before* `redirect()`. If the seed performs heavy I/O it will slow down verification. The welcome article inserts are bounded (three queries) and wrapped in a `try/catch` so failure never blocks redirect.

2. **Duplicate seeding on link click**: a user could click the verification link, then click it again — the second call has no `userId` (token already consumed) and never reaches `seedOnboardingArticle`. The idempotency guard inside `seedOnboardingArticle` is defense-in-depth against re-runs through other paths (admin seed scripts, etc.).

3. **`onboarding_example_article` notification appears for users who already had articles**: the seed guard returns early if the user has any articles, so no notification will be inserted in that case. This is the desired behavior — the notification only makes sense when the article is freshly created.

4. **The `NEXT_PUBLIC_ENABLE_NOTIFICATIONS` flag** gates the bell entirely. If the flag is off, the welcome article is still seeded; only the notification UI is hidden. This is acceptable but document it.

5. **Tour anchor element may be hidden or off-screen** (e.g. a button inside a collapsed `<details>`). The component handles `rect === null` with a centered fallback popover. For step 3 (`frontmatter-panel`) the `<details>` is collapsed by default — we anchor to the `<details>` element itself, which is always in the layout flow, so `getBoundingClientRect()` returns a valid rect.

6. **Stacking context / z-index conflicts**: existing modals (`CitationModal`, the notifications dropdown) use `z-50`. The tour overlay uses `z-40` and the popover `z-60`. Verify visually that nothing else uses `z-60` or higher.

7. **`box-shadow: 0 0 0 9999px`** dimming relies on the target having a non-zero size and no `overflow: hidden` on an ancestor cutting it off. If a target like the editor (`editor-content`) sits inside a clipped scroll container, the dimming may be cropped. Mitigation: the fallback `<div className="fixed inset-0 bg-black/40">` is rendered when no target is found; if the cutout effect is visually wrong on a particular target, switch that step to "no highlight" mode and render the full overlay.

8. **MDX frontmatter parsing**: the welcome article uses double-quoted JSON-style tags (`["welcome","getting-started"]`) because `parseFrontmatter` (and `FrontmatterPanel`'s parser) expect JSON for the `tags` and `description` values. Don't change to YAML lists without updating the parser.

9. **Test environment for `OnboardingTourGate`**: it's a server component that touches `@/lib/auth` (which transitively imports `jose`). Use `// @vitest-environment node` per repo convention, otherwise `jose`'s WebCrypto path breaks under jsdom.

10. **`revalidatePath("/", "layout")`** invalidates *everything* under the root layout, which is heavy but correct here — the onboarding flag is read in `OnboardingTourGate` which is mounted in the root layout. If this proves expensive in production, narrow it to the specific routes the user is likely on.

11. **Reserved slugs**: `/settings` is already in `RESERVED_SLUGS` in `lib/validations.ts`, so `/settings/onboarding` won't collide with a publisher slug. No edit needed.

12. **Don't include AI-attribution Co-Authored-By trailers in commits** (per repo memory). The implementing agent should commit each block above with a plain commit message and no AI attribution.
