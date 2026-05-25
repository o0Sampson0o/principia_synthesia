"use client";

import { useFormStatus } from "react-dom";
import Link from "next/link";
import { forkArticle } from "@/app/[publisher]/articles/fork-action";

interface Props {
  sourcePublisherSlug: string;
  sourceArticleSlug: string;
  isAuthenticated: boolean;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="themed-btn-secondary text-sm px-3 py-1 rounded disabled:opacity-50"
    >
      {pending ? "Forking…" : "Fork"}
    </button>
  );
}

export default function ForkButton({
  sourcePublisherSlug,
  sourceArticleSlug,
  isAuthenticated,
}: Props) {
  if (!isAuthenticated) {
    return (
      <Link href="/login" className="themed-link text-sm">
        Fork (sign in)
      </Link>
    );
  }

  return (
    <form action={forkArticle}>
      <input type="hidden" name="sourcePublisherSlug" value={sourcePublisherSlug} />
      <input type="hidden" name="sourceArticleSlug" value={sourceArticleSlug} />
      <SubmitButton />
    </form>
  );
}
