"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";
import TurnstileWidget from "./TurnstileWidget";

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
  /** Bound server action (publisherSlug + subject already curried in) */
  action: (formData: FormData) => Promise<void>;
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

/** localStorage key remembering the guest's display name between comments. */
const GUEST_NAME_KEY = "ps_guest_name";

// ---------------------------------------------------------------------------
// CommentForm
// ---------------------------------------------------------------------------

export default function CommentForm({
  action,
  parentId,
  commentId,
  initialBody = "",
  session,
  compact = false,
  isEdit = false,
}: CommentFormProps) {
  const [open, setOpen] = useState(!compact);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Guests posting a new comment supply a display name; remember it locally.
  const needsGuestFields = !session && !isEdit;

  // Pre-fill the (uncontrolled) name field from localStorage — DOM sync, not
  // state, so SSR markup stays stable and no cascading render occurs.
  useEffect(() => {
    if (!needsGuestFields) return;
    const el = formRef.current?.elements.namedItem("guestName");
    if (el instanceof HTMLInputElement && !el.value) {
      el.value = localStorage.getItem(GUEST_NAME_KEY) ?? "";
    }
  }, [needsGuestFields, open]);

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
    setError(null);
    if (needsGuestFields) {
      const name = (formData.get("guestName") as string | null)?.trim() ?? "";
      localStorage.setItem(GUEST_NAME_KEY, name);
    }
    try {
      await action(formData);
    } catch {
      setError("Could not post your comment. Please try again.");
      return;
    }
    formRef.current?.reset();
    if (compact) setOpen(false);
  }

  return (
    <form ref={formRef} action={handleAction} className={compact ? "mt-2" : "mt-4"}>
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      {commentId !== undefined && (
        <input type="hidden" name="commentId" value={commentId} />
      )}

      {needsGuestFields && (
        <>
          {/* Honeypot: hidden from real users; bots that fill it are dropped */}
          <div aria-hidden="true" className="sr-only">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <input
            type="text"
            name="guestName"
            placeholder="Your name"
            required
            minLength={2}
            maxLength={50}
            className="w-full mb-2 px-3 py-2 text-sm rounded border themed-input"
          />
        </>
      )}

      <textarea
        name="body"
        defaultValue={initialBody}
        placeholder={isEdit ? "Edit your comment…" : parentId ? "Write a reply…" : "Leave a comment…"}
        required
        minLength={1}
        maxLength={session ? 10000 : 5000}
        rows={compact ? 2 : 4}
        className="w-full px-3 py-2 text-sm rounded border themed-input resize-y"
      />

      {needsGuestFields && <TurnstileWidget />}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-2 mt-2">
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
        {needsGuestFields && !compact && (
          <span className="text-xs themed-muted">
            Commenting as a guest —{" "}
            <Link href="/login" className="themed-link underline underline-offset-2">
              sign in
            </Link>{" "}
            to comment as yourself.
          </span>
        )}
      </div>
    </form>
  );
}
