"use client";

import { useFormStatus } from "react-dom";
import { markArticleVerified } from "@/app/[publisher]/articles/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="themed-btn-ghost text-xs px-3 py-1"
    >
      {pending ? "Marking…" : "Mark as verified"}
    </button>
  );
}

type Props = {
  publisherSlug: string;
  articleId: number;
};

export default function MarkVerifiedForm({ publisherSlug, articleId }: Props) {
  const action = markArticleVerified.bind(null, publisherSlug);
  return (
    <form action={action}>
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="publisherSlug" value={publisherSlug} />
      <SubmitButton />
    </form>
  );
}
