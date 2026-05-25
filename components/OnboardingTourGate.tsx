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
