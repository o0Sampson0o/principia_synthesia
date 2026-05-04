import Link from "next/link";
import { loginAction } from "./actions";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (params.error === "invalid") {
    return (
      <p className="text-sm text-red-500 mb-4">
        Invalid email or password.
      </p>
    );
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="max-w-md mx-auto px-4 py-20">
      <h1 className="text-3xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">
        Sign in
      </h1>
      <ErrorMessage searchParams={searchParams} />
      <form action={loginAction} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full border rounded px-4 py-2 bg-white dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full border rounded px-4 py-2 bg-white dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="w-full px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
        >
          Sign in
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-400 dark:text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
    </main>
  );
}
