"use client";

/**
 * Submit button that asks for confirmation before letting its parent form
 * post. Used for one-click irreversible actions (delete a comment, etc.) so
 * a stray tap or Enter can't destroy anything.
 */
export default function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
