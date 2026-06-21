import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { createOrganization } from "../actions";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (params.error === "slug_taken") {
    return <p className="text-sm text-red-500 mb-4">That slug is already taken.</p>;
  }
  return null;
}

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="max-w-xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Organization</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>New organization</h1>
      </div>
      <ErrorMessage searchParams={searchParams} />
      <form action={createOrganization} className="space-y-4">
        <div>
          <label htmlFor="name" className="block font-medium themed-secondary mb-1.5" style={{ fontSize: "0.75rem" }}>
            Organization name
          </label>
          <input id="name" name="name" type="text" required maxLength={200} className="themed-input" />
        </div>
        <div>
          <label htmlFor="publisherSlug" className="block text-sm font-medium themed-secondary mb-1">
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
              placeholder="my-org"
              className="themed-input flex-1"
            />
          </div>
          <p className="text-xs themed-muted mt-1">3–40 characters, lowercase letters, numbers, and hyphens only.</p>
        </div>
        <button type="submit" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
          Create organization
        </button>
      </form>
      <p className="mt-6 text-sm themed-muted">
        <Link href="/organizations" className="themed-link">Back to organizations</Link>
      </p>
    </main>
  );
}
