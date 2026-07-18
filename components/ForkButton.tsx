"use client";

import Link from "next/link";
import { forkArticle } from "@/app/[publisher]/articles/fork-action";
import { toastError } from "@/lib/toast";
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
 * surface as toasts instead of crashing to the route error page.
 */
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
        title={`${FORK_HINT} Requires signing in.`}
        className="ps-quiet-action inline-block"
      >
        Fork — sign in
      </Link>
    );
  }

  async function handleAction(formData: FormData) {
    try {
      const result = await forkArticle(formData);
      if (result && "error" in result) toastError(result.error, "Fork failed");
      // On success the action redirects; nothing to do here.
    } catch (err) {
      // Next's redirect travels as a thrown error — let it through
      const digest = (err as { digest?: string })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
      toastError("Fork failed — please try again.", "Fork failed");
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
    </form>
  );
}
