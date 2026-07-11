import Link from "next/link";
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
    <main className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
      <div className="mb-10">
        <p className="ps-eyebrow mb-3">
            <Link href="/settings" className="hover:opacity-70 transition-opacity">Settings</Link>
          </p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
          Onboarding
        </h1>
        <p className="themed-muted mt-2" style={{ fontSize: "0.875rem" }}>
          The product tour appears once for new accounts. You can replay it any time.
        </p>
      </div>

      <hr className="themed-hr mb-10" />

      <section>
        <p className="text-sm themed-secondary mb-4">
          {u?.onboardingCompletedAt
            ? `You completed the tour on ${new Date(u.onboardingCompletedAt).toLocaleDateString()}.`
            : "You have not finished the tour yet."}
        </p>
        <form action={resetOnboarding}>
          <button type="submit" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
            Replay tour
          </button>
        </form>
      </section>
    </main>
  );
}
