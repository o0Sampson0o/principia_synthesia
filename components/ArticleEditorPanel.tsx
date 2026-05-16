"use client";

import { useRef } from "react";
import ContentEditor, { type ContentEditorRef } from "./ContentEditor";
import InsertImageButton from "./InsertImageButton";
import FrontmatterPanel from "./FrontmatterPanel";
import type { ArticleMetadata } from "@/lib/validations";

export default function ArticleEditorPanel({
  publisherSlug,
  initial = "",
  initialMetadata,
}: {
  publisherSlug: string;
  initial?: string;
  initialMetadata: ArticleMetadata;
}) {
  const editorRef = useRef<ContentEditorRef>(null);

  return (
    <div className="space-y-3">
      <FrontmatterPanel editorRef={editorRef} initialMetadata={initialMetadata} />
      <ContentEditor
        ref={editorRef}
        initial={initial}
        toolbar={
          <InsertImageButton publisherSlug={publisherSlug} editorRef={editorRef} />
        }
      />
    </div>
  );
}
