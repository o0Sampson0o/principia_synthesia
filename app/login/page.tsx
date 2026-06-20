import Link from "next/link";
import { loginAction } from "./actions";

async function StatusMessage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verified?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  if (params.verified === "1") {
    return (
      <p className="text-sm text-green-600 dark:text-green-400 mb-4">
        Email verified — please sign in.
      </p>
    );
  }
  if (params.verified === "error") {
    return (
      <p className="text-sm text-red-500 mb-4">
        That verification link has expired or has already been used.
      </p>
    );
  }
  if (params.error === "invalid") {
    return <p className="text-sm text-red-500 mb-4">Invalid email or password.</p>;
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verified?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo =
    typeof params.redirect === "string" && params.redirect.startsWith("/") && !params.redirect.startsWith("//")
      ? params.redirect
      : undefined;

  return (
    <main className="flex-1 flex items-center justify-center px-5 py-20">
      <div className="w-full" style={{ maxWidth: "22rem" }}>

        <div className="text-center mb-8">
          <h1
            className="themed-heading mb-1.5"
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontWeight: 500,
              fontSize: "1.875rem",
              letterSpacing: "-0.03em",
            }}
          >
            Welcome back
          </h1>
          <p className="themed-muted" style={{ fontSize: "0.875rem" }}>
            Sign in to your account to continue
          </p>
        </div>

        <div className="themed-auth-card">
          <StatusMessage searchParams={searchParams} />
          <form action={loginAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="block themed-secondary font-medium mb-1.5" style={{ fontSize: "0.75rem" }}>
                Email
              </label>
              <input id="email" name="email" type="email" required autoComplete="email" className="themed-input" />
            </div>
            <div>
              <label htmlFor="password" className="block themed-secondary font-medium mb-1.5" style={{ fontSize: "0.75rem" }}>
                Password
              </label>
              <input id="password" name="password" type="password" required autoComplete="current-password" className="themed-input" />
            </div>
            {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
            <button
              type="submit"
              className="themed-btn-accent w-full rounded-lg justify-center"
              style={{ paddingTop: "0.625rem", paddingBottom: "0.625rem", fontSize: "0.875rem" }}
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-5 themed-muted text-center" style={{ fontSize: "0.8125rem" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="themed-link">Get started</Link>
        </p>

      </div>
    </main>
  );
}
