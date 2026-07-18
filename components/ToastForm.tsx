"use client";

import { toastError } from "@/lib/toast";

/** Result shapes the app's server actions return on expected failure. */
type ActionResult =
  | void
  | { error?: string | Record<string, string> }
  | { errors?: Record<string, string[] | string | undefined> };

function extractMessage(result: ActionResult): string | null {
  if (!result || typeof result !== "object") return null;
  if ("error" in result && result.error) {
    return typeof result.error === "string"
      ? result.error
      : Object.values(result.error).join(" ");
  }
  if ("errors" in result && result.errors) {
    const parts = Object.values(result.errors)
      .flat()
      .filter((v): v is string => typeof v === "string");
    if (parts.length) return parts.join(" ");
  }
  return null;
}

/**
 * Form wrapper that surfaces server-action failures as toasts WITHOUT
 * navigating: the action returns its error instead of redirecting, so the
 * page keeps its scroll position and every typed field survives. Success
 * paths still redirect server-side and pass through untouched.
 */
export default function ToastForm({
  action,
  errorTitle = "Not saved",
  className,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  errorTitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  async function handle(formData: FormData) {
    try {
      const message = extractMessage(await action(formData));
      if (message) toastError(message, errorTitle);
    } catch (err) {
      // Next's success-redirect travels as a thrown error — let it through
      const digest = (err as { digest?: string })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
      toastError("Something went wrong — please try again.", errorTitle);
    }
  }

  return (
    <form action={handle} className={className}>
      {children}
    </form>
  );
}
