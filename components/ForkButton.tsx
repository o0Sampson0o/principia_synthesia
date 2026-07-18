"use client";

import { useState } from "react";
import Link from "next/link";
import { forkArticle } from "@/app/[publisher]/articles/fork-action";
import ConfirmButton from "./ConfirmButton";

interface Props {
  sourcePublisherSlug: string;
  sourceArticleSlug: string;
  isAuthenticated: boolean;
}

const FORK_HINT =
  "This creates your own editable draft copy of the article under your name. " +
  "The original stays untouched, and its author is notified.";

/**
 * Fork action for the article meta row. The consequence is stated in an
 * in-page confirm dialog (never a tooltip alone), and expected failures
 * render inline instead of crashing to the route error page.
 */
export default function ForkButton({
  sourcePublisherSlug,
  sourceArticleSlug,
  isAuthenticated,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const articlePath = `/${sourcePublisherSlug}/articles/${sourceArticleSlug}`;

  if (!isAuthenticated) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(articlePath)}`}
        title={`${FORK_HINT} Requires signing in.`}
        className="ps-quiet-action inline-block"
      >
        Fork — sign in
      </Link>
    );
  }

  async function handleAction(formData: FormData) {
    setError(null);
    try {
      const result = await forkArticle(formData);
      if (result && "error" in result) setError(result.error);
      // On success the action redirects; nothing to do here.
    } catch (err) {
      // Next's redirect travels as a thrown error — let it through
      const digest = (err as { digest?: string })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
      setError("Fork failed — please try again.");
    }
  }

  return (
    <form action={handleAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="sourcePublisherSlug" value={sourcePublisherSlug} />
      <input type="hidden" name="sourceArticleSlug" value={sourceArticleSlug} />
      <ConfirmButton
        title="Fork this article"
        message={FORK_HINT}
        confirmLabel="Create my fork"
        className="ps-quiet-action"
      >
        Fork
      </ConfirmButton>
      {error && (
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--color-error)" }}>
          {error}
        </span>
      )}
    </form>
  );
}
