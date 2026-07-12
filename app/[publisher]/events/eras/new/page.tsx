import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import EraCreateForm from "./EraCreateForm";

export default async function NewEraPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  const isOwner = await canEditContent(session, ownerType, ownerId);
  if (!isOwner) notFound();

  return (
    <main className="w-full max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <Link href={`/${publisherSlug}/events/eras`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        Eras
      </Link>
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Era</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>New era</h1>
      </div>

      <EraCreateForm publisherSlug={publisherSlug} />
    </main>
  );
}
