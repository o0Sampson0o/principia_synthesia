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
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold themed-heading mb-1">New era</h1>
        <p className="themed-muted text-sm">
          <Link href={`/${publisherSlug}/events/eras`} className="themed-link hover:underline">
            ← Eras
          </Link>
        </p>
      </div>

      <EraCreateForm publisherSlug={publisherSlug} />
    </main>
  );
}
