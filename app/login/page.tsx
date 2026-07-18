import Link from "next/link";
import { loginAction } from "./actions";
import ToastForm from "@/components/ToastForm";
import SearchParamToast from "@/components/SearchParamToast";

async function StatusMessage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verified?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  // Note: never clear the `redirect` param — the login form relies on it.
  if (params.verified === "1") {
    return (
      <SearchParamToast
        message="Email verified — please sign in."
        title="Verified"
        variant="success"
        clearParams={["verified"]}
      />
    );
  }
  if (params.verified === "error") {
    return (
      <SearchParamToast
        message="That verification link has expired or has already been used."
        title="Verification failed"
        clearParams={["verified"]}
      />
    );
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
          <p className="ps-eyebrow mb-4">Principia Synthesia</p>
          <h1
            className="ps-display themed-heading"
            style={{ fontSize: "2rem" }}
          >
            Welcome back
          </h1>
          <p className="themed-muted mt-2" style={{ fontSize: "0.875rem" }}>
            Sign in to your account to continue
          </p>
        </div>

        <div className="ps-form-card">
          <StatusMessage searchParams={searchParams} />
          <ToastForm action={loginAction} errorTitle="Sign-in failed" className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block themed-secondary font-medium mb-1.5"
                style={{ fontSize: "0.75rem" }}
              >
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
              <label
                htmlFor="password"
                className="block themed-secondary font-medium mb-1.5"
                style={{ fontSize: "0.75rem" }}
              >
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
            <button
              type="submit"
              className="themed-btn-accent w-full rounded-lg justify-center mt-1"
              style={{ paddingTop: "0.65rem", paddingBottom: "0.65rem", fontSize: "0.9375rem" }}
            >
              Sign in
            </button>
          </ToastForm>
        </div>

        <p className="mt-5 themed-muted text-center" style={{ fontSize: "0.8125rem" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="themed-link">
            Get started
          </Link>
        </p>

      </div>
    </main>
  );
}
