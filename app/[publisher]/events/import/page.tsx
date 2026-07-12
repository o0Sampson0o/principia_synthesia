import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import Link from "next/link";
import ImportEventsForm from "@/components/ImportEventsForm";
import { previewImport, confirmImport } from "./actions";

export default async function ImportEventsPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}/events`);
  }

  async function preview(_prevState: unknown, formData: FormData) {
    "use server";
    return previewImport(publisherSlug, null, formData);
  }

  async function confirm(_prevState: unknown, formData: FormData) {
    "use server";
    return confirmImport(publisherSlug, null, formData);
  }

  return (
    <main className="w-full max-w-3xl mx-auto px-5 py-10 sm:py-14">
      <Link href={`/${publisherSlug}/events`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        Events
      </Link>
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Events</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Bulk import</h1>
      </div>

      <div className="themed-surface rounded border themed-border p-4 mb-6 text-sm space-y-2">
        <p className="font-medium themed-heading">CSV format</p>
        <p className="themed-secondary">
          Headers (first row): <code className="font-mono">title,slug,eventDate,description,category,eraName,isEraStart,isEraEnd</code>
        </p>
        <p className="themed-muted">
          <code className="font-mono">eventDate</code> must be an ISO 8601 date (e.g. <code className="font-mono">2024-06-15</code>).
          Slugs missing are auto-generated from the title.
        </p>
      </div>

      <ImportEventsForm previewAction={preview} confirmAction={confirm} />
    </main>
  );
}
