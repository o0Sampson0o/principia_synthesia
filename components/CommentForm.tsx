"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { SessionPayload } from "@/lib/auth";

// ---------------------------------------------------------------------------
// SubmitButton (needs useFormStatus, must be its own component)
// ---------------------------------------------------------------------------

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 text-sm font-medium rounded themed-btn-primary disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommentFormProps {
  /** Bound server action (already has publisherSlug + articleSlug curried in) */
  action: (formData: FormData) => Promise<void>;
  articleId: number;
  /** Set when this form is a reply to an existing comment */
  parentId?: number;
  /** Set when this form is editing an existing comment */
  commentId?: number;
  /** Pre-fill body for edit forms */
  initialBody?: string;
  session: SessionPayload | null;
  /** Render in compact "inline" mode (reply / edit inline) */
  compact?: boolean;
  /** True when this form submits an edit (not a new comment) */
  isEdit?: boolean;
}

// ---------------------------------------------------------------------------
// CommentForm
// ---------------------------------------------------------------------------

export default function CommentForm({
  action,
  articleId,
  parentId,
  commentId,
  initialBody = "",
  session,
  compact = false,
  isEdit = false,
}: CommentFormProps) {
  const [open, setOpen] = useState(!compact);
  const formRef = useRef<HTMLFormElement>(null);

  if (!session) {
    if (compact) return null;
    return (
      <p className="text-sm themed-muted">
        <a href="/login" className="themed-link underline underline-offset-2">
          Sign in
        </a>{" "}
        to leave a comment.
      </p>
    );
  }

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs themed-muted hover:themed-link transition-colors"
      >
        {isEdit ? "Edit" : "Reply"}
      </button>
    );
  }

  async function handleAction(formData: FormData) {
    await action(formData);
    formRef.current?.reset();
    if (compact) setOpen(false);
  }

  return (
    <form ref={formRef} action={handleAction} className={compact ? "mt-2" : "mt-4"}>
      <input type="hidden" name="articleId" value={articleId} />
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      {commentId !== undefined && (
        <input type="hidden" name="commentId" value={commentId} />
      )}

      <textarea
        name="body"
        defaultValue={initialBody}
        placeholder={isEdit ? "Edit your comment…" : parentId ? "Write a reply…" : "Leave a comment…"}
        required
        minLength={1}
        maxLength={10000}
        rows={compact ? 2 : 4}
        className="w-full px-3 py-2 text-sm rounded border themed-input resize-y"
      />

      <div className="flex gap-2 mt-2">
        <SubmitButton label={isEdit ? "Save" : parentId ? "Reply" : "Comment"} />
        {compact && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm themed-muted hover:themed-link transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
