import Link from "next/link";
import { signupAction } from "./actions";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (params.error === "email_taken") {
    return <p className="text-sm text-red-500 mb-4">That email address is already in use.</p>;
  }
  if (params.error === "slug_taken") {
    return <p className="text-sm text-red-500 mb-4">That publisher slug is already taken.</p>;
  }
  return null;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-bold mb-6 themed-heading">Create an account</h1>
      <ErrorMessage searchParams={searchParams} />
      <form action={signupAction} className="space-y-4">
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
            autoComplete="new-password"
            minLength={8}
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium themed-secondary mb-1">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            maxLength={100}
            className="themed-input"
          />
        </div>
        <div>
          <label
            htmlFor="publisherSlug"
            className="block text-sm font-medium themed-secondary mb-1"
          >
            Publisher slug
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm themed-muted">/</span>
            <input
              id="publisherSlug"
              name="publisherSlug"
              type="text"
              required
              minLength={3}
              maxLength={40}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              placeholder="your-slug"
              className="themed-input flex-1"
            />
          </div>
          <p className="text-xs themed-muted mt-1">
            3–40 characters, lowercase letters, numbers, and hyphens only. This is permanent.
          </p>
        </div>
        <button type="submit" className="themed-btn-primary w-full">
          Create account
        </button>
      </form>
      <p className="mt-6 text-sm themed-muted">
        Already have an account?{" "}
        <Link href="/login" className="themed-link">
          Sign in
        </Link>
      </p>
    </main>
  );
}
