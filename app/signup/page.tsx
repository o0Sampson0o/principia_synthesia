import Link from "next/link";
import { signupAction } from "./actions";
import ToastForm from "@/components/ToastForm";

export default async function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-5 py-16">
      <div className="w-full" style={{ maxWidth: "22rem" }}>

        <div className="text-center mb-8">
          <p className="ps-eyebrow mb-4">Principia Synthesia</p>
          <h1
            className="ps-display themed-heading"
            style={{ fontSize: "2rem" }}
          >
            Create an account
          </h1>
          <p className="themed-muted mt-2" style={{ fontSize: "0.875rem" }}>
            Join the platform for scientific publishing
          </p>
        </div>

        <div className="ps-form-card">
          <ToastForm action={signupAction} errorTitle="Sign-up failed" className="space-y-4">
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
                autoComplete="new-password"
                minLength={8}
                className="themed-input"
              />
            </div>
            <div>
              <label
                htmlFor="displayName"
                className="block themed-secondary font-medium mb-1.5"
                style={{ fontSize: "0.75rem" }}
              >
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
                className="block themed-secondary font-medium mb-1.5"
                style={{ fontSize: "0.75rem" }}
              >
                Publisher slug
              </label>
              <div className="flex items-center gap-1.5">
                <span className="themed-muted shrink-0" style={{ fontSize: "0.875rem" }}>/</span>
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
              <p className="themed-muted mt-1.5" style={{ fontSize: "0.75rem" }}>
                3–40 chars, lowercase + hyphens. Permanent after creation.
              </p>
            </div>
            <button
              type="submit"
              className="themed-btn-accent w-full rounded-lg justify-center mt-1"
              style={{ paddingTop: "0.65rem", paddingBottom: "0.65rem", fontSize: "0.9375rem" }}
            >
              Create account
            </button>
          </ToastForm>
        </div>

        <p className="mt-5 themed-muted text-center" style={{ fontSize: "0.8125rem" }}>
          Already have an account?{" "}
          <Link href="/login" className="themed-link">
            Sign in
          </Link>
        </p>

      </div>
    </main>
  );
}
