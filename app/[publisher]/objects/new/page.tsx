import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createKaoObject } from "../actions";

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
    await createKaoObject(publisherSlug, null, formData);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-6">New object</h1>
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="type" className="block text-sm font-medium themed-secondary mb-1">
            Type
          </label>
          <select id="type" name="type" className="themed-input" required>
            <option value="animation">Animation (anim-)</option>
            <option value="dataset">Dataset (object-)</option>
            <option value="diagram">Diagram (object-)</option>
          </select>
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            placeholder="anim-my-animation or object-my-object"
            className="themed-input"
          />
          <p className="text-xs themed-muted mt-1">Animations: &ldquo;anim-&rdquo; prefix. Others: &ldquo;object-&rdquo; prefix.</p>
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-medium themed-secondary mb-1">
            Name
          </label>
          <input id="name" name="name" type="text" required maxLength={200} className="themed-input" />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium themed-secondary mb-1">
            Description
          </label>
          <textarea id="description" name="description" rows={2} maxLength={1000} className="themed-input w-full resize-y" />
        </div>
        <div>
          <label htmlFor="content" className="block text-sm font-medium themed-secondary mb-1">
            Content (JSON or JS code for animations)
          </label>
          <textarea
            id="content"
            name="content"
            rows={15}
            required
            className="themed-input w-full font-mono text-sm resize-y"
            placeholder='{"code": "// animation code here"}'
          />
        </div>
        <button type="submit" className="themed-btn-primary">
          Create object
        </button>
      </form>
    </main>
  );
}
