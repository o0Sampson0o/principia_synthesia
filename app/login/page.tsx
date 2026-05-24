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
    <main className="max-w-md mx-auto px-4 py-20">
      <h1 className="text-3xl font-bold mb-6 themed-heading">Sign in</h1>
      <StatusMessage searchParams={searchParams} />
      <form action={loginAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium themed-secondary mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium themed-secondary mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="themed-input"
          />
        </div>
        {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
        <button type="submit" className="themed-btn-primary w-full">
          Sign in
        </button>
      </form>
      <p className="mt-6 text-sm themed-muted">
        <Link href="/" className="themed-link">
          Back to home
        </Link>
      </p>
    </main>
  );
}
