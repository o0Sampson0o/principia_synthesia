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
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="text-sm themed-muted mb-4">
        <Link href={`/${publisherSlug}`} className="themed-link">@{publisherSlug}</Link>
        {" / "}
        <Link href={`/${publisherSlug}/events`} className="themed-link">Events</Link>
        {" / "}
        <span>Import</span>
      </div>

      <h1 className="text-3xl font-bold themed-heading mb-6">Bulk import events</h1>

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
