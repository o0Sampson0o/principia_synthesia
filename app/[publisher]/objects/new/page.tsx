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
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-6">New object</h1>
      <form action={action} className="space-y-4">
        <NewObjectFormClient />
        <button type="submit" className="themed-btn-primary">
          Create object
        </button>
      </form>
    </main>
  );
}
