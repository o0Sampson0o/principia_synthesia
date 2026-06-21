import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { updateKaoObject, updateDiagram, deleteKaoObject } from "../../actions";
import { isDiagramContent, type KaoContent } from "@/lib/kao";
import EditObjectFormClient from "@/components/EditObjectFormClient";

export default async function EditObjectPage({
  params,
}: {
  params: Promise<{ publisher: string; objSlug: string }>;
}) {
  const { publisher: publisherSlug, objSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}/objects/${objSlug}`);
  }

  const [obj] = await db
    .select()
    .from(objects)
    .where(
      and(eq(objects.slug, objSlug), eq(objects.ownerType, ownerType), eq(objects.ownerId, ownerId))
    )
    .limit(1);

  if (!obj) notFound();

  const content = obj.content as KaoContent;
  const isDiagram = obj.type === "diagram" && isDiagramContent(content);

  async function updateAction(formData: FormData): Promise<void> {
    "use server";
    if (isDiagram) {
      await updateDiagram(publisherSlug, null, formData);
    } else {
      await updateKaoObject(publisherSlug, null, formData);
    }
  }

  async function deleteAction(formData: FormData): Promise<void> {
    "use server";
    await deleteKaoObject(publisherSlug, formData);
  }

  return (
    <main className="max-w-4xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Object</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Edit object</h1>
      </div>
      <EditObjectFormClient
        id={obj.id}
        slug={obj.slug}
        name={obj.name}
        type={obj.type}
        description={obj.description ?? ""}
        content={content}
        isDiagram={isDiagram}
        diagramFormat={isDiagram ? (content as { format: "mermaid" | "graphviz"; source: string }).format : "mermaid"}
        diagramSource={isDiagram ? (content as { format: "mermaid" | "graphviz"; source: string }).source : ""}
        rawContentJson={isDiagram ? "" : JSON.stringify(content, null, 2)}
        updateAction={updateAction}
        deleteAction={deleteAction}
        publisherSlug={publisherSlug}
        objSlug={objSlug}
      />
    </main>
  );
}
