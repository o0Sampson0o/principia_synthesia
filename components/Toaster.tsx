"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToToasts, type ToastItem } from "@/lib/toast";

const AUTO_DISMISS_MS = 6000;

/**
 * The one toast outlet, mounted in the root layout. Quiet Library voice:
 * surface + hairline + the floating-overlay shadow, a mono micro label,
 * and the message — floating above the page so nothing reflows.
 */
export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return subscribeToToasts((t) => {
      setToasts((prev) => [...prev, t]);
      timers.current.set(
        t.id,
        setTimeout(() => dismiss(t.id), AUTO_DISMISS_MS)
      );
    });
  }, []);

  function dismiss(id: number) {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  /** Hovering a toast holds it open; leaving restarts a short fuse. */
  function hold(id: number) {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }
  function release(id: number) {
    timers.current.set(id, setTimeout(() => dismiss(id), 2000));
  }

  return (
    <div className="ps-toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.variant === "error" ? "alert" : "status"}
          className="ps-toast"
          onMouseEnter={() => hold(t.id)}
          onMouseLeave={() => release(t.id)}
        >
          <div className="ps-toast-content">
            <p
              className="ps-mono-micro"
              style={{
                color:
                  t.variant === "error"
                    ? "var(--color-error)"
                    : t.variant === "success"
                    ? "var(--color-success)"
                    : "var(--muted-foreground)",
              }}
            >
              {t.title}
            </p>
            <p className="ps-toast-message">{t.message}</p>
          </div>
          <button
            type="button"
            className="ps-toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
