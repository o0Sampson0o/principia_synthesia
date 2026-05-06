import Link from "next/link";
import { loginAction } from "./actions";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (params.error === "invalid") {
    return <p className="text-sm text-red-500 mb-4">Invalid email or password.</p>;
  }
  return null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-bold mb-6 themed-heading">Sign in</h1>
      <ErrorMessage searchParams={searchParams} />
      <form action={loginAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium themed-secondary mb-1">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="themed-input" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium themed-secondary mb-1">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="themed-input" />
        </div>
        <button type="submit" className="themed-btn-primary w-full">Sign in</button>
      </form>
      <p className="mt-6 text-sm themed-muted">
        <Link href="/" className="themed-link">Back to home</Link>
      </p>
    </main>
  );
}
