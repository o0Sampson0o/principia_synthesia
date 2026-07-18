"use client";

import { markArticleVerified } from "@/app/[publisher]/articles/actions";
import ConfirmButton from "./ConfirmButton";

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
      <ConfirmButton
        title="Mark as verified"
        message="This stamps today's date as the article's public 'last verified' mark, telling readers the content is current."
        confirmLabel="Mark verified"
        className="ps-quiet-action"
      >
        Mark as verified
      </ConfirmButton>
    </form>
  );
}
