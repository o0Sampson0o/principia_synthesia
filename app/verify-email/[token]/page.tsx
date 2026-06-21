import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmVerification } from "./actions";

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        <p className="ps-eyebrow mb-4">Account</p>
        <h1 className="ps-display themed-heading mb-5" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          Verify your email address
        </h1>
        <p className="themed-muted mb-8" style={{ fontSize: "0.9375rem", lineHeight: 1.7 }}>
          Click the button below to confirm your email address and activate your
          account.
        </p>
        <form action={confirmVerification} className="mb-6">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
            Verify email
          </button>
        </form>
        <p className="themed-muted" style={{ fontSize: "0.875rem" }}>
          Wrong browser?{" "}
          <Link href="/login" className="themed-link">
            Sign in instead
          </Link>
        </p>
      </div>
    </main>
  );
}
