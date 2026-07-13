import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import AccountEditor from "./AccountEditor";

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return (
    <main className="w-full flex-1">
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto px-5 py-8 sm:py-11">
          <p className="ps-eyebrow mb-3">
            <Link href="/settings" className="hover:opacity-70 transition-opacity">Settings</Link>
          </p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            Account
          </h1>
          <p className="themed-muted mt-2" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            {user?.email} · @{session.userSlug}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-12">
        <AccountEditor initialDisplayName={user?.displayName ?? ""} />
      </div>
    </main>
  );
}
