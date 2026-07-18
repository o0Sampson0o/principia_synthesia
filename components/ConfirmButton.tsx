"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

interface Props {
  /** The consequence, stated plainly — shown as the dialog body. */
  message: string;
  /** Mono micro label at the top of the dialog. */
  title?: string;
  confirmLabel?: string;
  /** Destructive styling on the confirm action. */
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Submit button gated by an in-page themed <dialog> confirm — the Quiet
 * Library never speaks through browser chrome. Used for irreversible or
 * consequential actions (delete a comment, fork an article, mark verified).
 * The trigger lives inside the form it guards; confirming submits that form.
 */
export default function ConfirmButton({
  message,
  title = "Please confirm",
  confirmLabel = "Confirm",
  danger = false,
  className,
  children,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  function confirm() {
    dialogRef.current?.close();
    triggerRef.current?.form?.requestSubmit();
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={pending}
        className={className}
        onClick={() => dialogRef.current?.showModal()}
      >
        {children}
      </button>
      <dialog
        ref={dialogRef}
        className="ps-confirm-dialog"
        aria-label={title}
        onClick={(e) => {
          // Light-dismiss on backdrop click
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <p className="ps-confirm-label">{title}</p>
        <p className="ps-confirm-body">{message}</p>
        <div className="ps-confirm-actions">
          <button
            type="button"
            className="themed-btn-outline rounded-lg"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "themed-btn-danger rounded-lg" : "themed-btn-accent rounded-lg"}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
