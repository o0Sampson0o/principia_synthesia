"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";
import { toastError } from "@/lib/toast";
import TurnstileWidget from "./TurnstileWidget";

// ---------------------------------------------------------------------------
// SubmitButton (needs useFormStatus, must be its own component)
// ---------------------------------------------------------------------------

function SubmitButton({ label, compact }: { label: string; compact?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="themed-btn-accent rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      style={{
        fontSize: compact ? "0.75rem" : "0.8125rem",
        padding: compact ? "0.3125rem 0.875rem" : "0.4375rem 1.125rem",
        fontWeight: 500,
      }}
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
  action: (formData: FormData) => Promise<void | { error: string }>;
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
  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Keyboard users must never lose their place: focus moves into the
  // textarea when a compact form opens, and back to the trigger on close.
  // prevOpen guards the initial mount — only user-driven toggles move focus.
  const prevOpen = useRef(open);
  useEffect(() => {
    if (!compact || prevOpen.current === open) return;
    prevOpen.current = open;
    const root = containerRef.current;
    if (!root) return;
    if (open) root.querySelector("textarea")?.focus();
    else root.querySelector("button")?.focus();
  }, [open, compact]);

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
      <div ref={containerRef} style={{ display: "contents" }}>
        <button type="button" onClick={() => setOpen(true)} className="ps-quiet-action">
          {isEdit ? "Edit" : "Reply"}
        </button>
      </div>
    );
  }

  async function handleAction(formData: FormData) {
    if (needsGuestFields) {
      const name = (formData.get("guestName") as string | null)?.trim() ?? "";
      localStorage.setItem(GUEST_NAME_KEY, name);
    }
    try {
      const result = await action(formData);
      if (result && typeof result === "object" && "error" in result) {
        toastError(result.error, "Comment not posted");
        return;
      }
    } catch {
      // Unexpected failure (network, redacted server error)
      toastError("Could not post your comment. Please try again.", "Comment not posted");
      return;
    }
    formRef.current?.reset();
    if (compact) setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ display: "contents" }}>
    <form
      ref={formRef}
      action={handleAction}
      className={compact ? "mt-2 w-full" : undefined}
    >
      {parentId !== undefined && <input type="hidden" name="parentId" value={parentId} />}
      {commentId !== undefined && <input type="hidden" name="commentId" value={commentId} />}

      {needsGuestFields && (
        <>
          {/* Honeypot: hidden from real users; bots that fill it are dropped */}
          <div aria-hidden="true" className="sr-only">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="sr-only" htmlFor={`guest-name-${parentId ?? "root"}`}>
            Your name
          </label>
          <input
            id={`guest-name-${parentId ?? "root"}`}
            type="text"
            name="guestName"
            placeholder="Your name"
            required
            minLength={2}
            maxLength={50}
            className="w-full themed-input rounded-md"
            style={{ padding: "0.5rem 0.75rem", marginBottom: "0.5rem" }}
          />
        </>
      )}

      <label className="sr-only" htmlFor={`comment-body-${commentId ?? parentId ?? "root"}`}>
        {isEdit ? "Edit your comment" : parentId ? "Your reply" : "Your comment"}
      </label>
      <textarea
        id={`comment-body-${commentId ?? parentId ?? "root"}`}
        name="body"
        defaultValue={initialBody}
        placeholder={
          isEdit ? "Edit your comment…" : parentId ? "Write a reply…" : "Join the discussion…"
        }
        required
        minLength={1}
        maxLength={session ? 10000 : 5000}
        rows={compact ? 2 : 4}
        className="w-full themed-input rounded-md resize-y"
        style={{ padding: "0.5rem 0.75rem", lineHeight: 1.6 }}
      />

      {needsGuestFields && <TurnstileWidget />}

      <div className="flex items-baseline gap-3 mt-2.5 flex-wrap">
        <SubmitButton
          label={isEdit ? "Save" : parentId ? "Reply" : "Post comment"}
          compact={compact}
        />
        {compact && (
          <button type="button" onClick={() => setOpen(false)} className="ps-quiet-action">
            Cancel
          </button>
        )}
        {needsGuestFields && !compact && (
          <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
            Commenting as a guest —{" "}
            <Link
              href={`/login?redirect=${encodeURIComponent(pathname)}`}
              className="themed-accent underline underline-offset-2"
            >
              sign in
            </Link>{" "}
            to comment as yourself.
          </span>
        )}
      </div>
    </form>
    </div>
  );
}
