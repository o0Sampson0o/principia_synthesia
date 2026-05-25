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
