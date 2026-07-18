/**
 * Tiny pub/sub toast store — no context threading, no library. Client
 * components call `toastError(...)` (or `toast(...)`); the single
 * <Toaster /> in the root layout subscribes and renders the stack.
 */

export type ToastVariant = "error" | "success" | "info";

export interface ToastItem {
  id: number;
  /** Mono micro label at the top of the toast (e.g. "Not saved"). */
  title: string;
  message: string;
  variant: ToastVariant;
}

type Listener = (t: ToastItem) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function subscribeToToasts(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(
  message: string,
  opts: { title?: string; variant?: ToastVariant } = {}
): void {
  const item: ToastItem = {
    id: nextId++,
    message,
    title: opts.title ?? (opts.variant === "success" ? "Done" : "Notice"),
    variant: opts.variant ?? "info",
  };
  for (const fn of listeners) fn(item);
}

export function toastError(message: string, title = "Not saved"): void {
  toast(message, { title, variant: "error" });
}
