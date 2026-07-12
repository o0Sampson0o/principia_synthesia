import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createKaoObject, createDiagram } from "../actions";
import NewObjectFormClient from "@/components/NewObjectFormClient";

export default async function NewObjectPage({
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
    redirect(`/${publisherSlug}`);
  }

  async function action(formData: FormData): Promise<void> {
    "use server";
    const type = formData.get("type");
    if (type === "diagram") {
      await createDiagram(publisherSlug, null, formData);
    } else {
      await createKaoObject(publisherSlug, null, formData);
    }
  }

  return (
    <main className="w-full max-w-4xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Object</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>New object</h1>
      </div>
      <form action={action} className="space-y-4">
        <NewObjectFormClient />
        <button type="submit" className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
          Create object
        </button>
      </form>
    </main>
  );
}
