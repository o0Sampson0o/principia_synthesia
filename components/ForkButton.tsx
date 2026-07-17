"use client";

import { useFormStatus } from "react-dom";
import Link from "next/link";
import { forkArticle } from "@/app/[publisher]/articles/fork-action";

interface Props {
  sourcePublisherSlug: string;
  sourceArticleSlug: string;
  isAuthenticated: boolean;
}

const FORK_HINT = "Create your own editable copy of this article under your name";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={FORK_HINT}
      className="ps-quiet-action disabled:opacity-50"
      onClick={(e) => {
        // The consequence must be visible, not tooltip-only: forking
        // immediately creates an article under the reader's name.
        if (!window.confirm(`Fork this article? ${FORK_HINT}.`)) e.preventDefault();
      }}
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
  const articlePath = `/${sourcePublisherSlug}/articles/${sourceArticleSlug}`;

  if (!isAuthenticated) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(articlePath)}`}
        title={`${FORK_HINT} — requires signing in`}
        className="ps-quiet-action inline-block"
      >
        Fork
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
