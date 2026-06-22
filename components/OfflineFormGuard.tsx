"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getQueue, enqueue, dequeue, type QueuedSubmission } from "@/lib/offline-queue";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

function fillForm(item: QueuedSubmission) {
  const forms = document.querySelectorAll<HTMLFormElement>("form");
  for (const form of forms) {
    for (const [name, value] of item.fields) {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[name="${CSS.escape(name)}"]`
      );
      if (el && "value" in el) el.value = value;
    }
  }
}

export default function OfflineFormGuard() {
  const [queue, setQueue] = useState<QueuedSubmission[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setQueue(getQueue()), []);

  useEffect(() => { if (isOnline) refresh(); }, [isOnline, refresh]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Auto-fill form fields when navigating back to a queued page
  useEffect(() => {
    const match = queue.find((item) => item.pageUrl === window.location.href);
    if (!match) return;
    fillForm(match);
    const t = setTimeout(() => fillForm(match), 200);
    return () => clearTimeout(t);
  }, [queue]);

  useEffect(() => {
    refresh();

    const handleSubmit = (e: Event) => {
      if (navigator.onLine) return;

      const form = e.target as HTMLFormElement;
      if (form.dataset.noOfflineQueue !== undefined) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const fd = new FormData(form);
      const fields: [string, string][] = [];
      for (const [key, value] of fd.entries()) {
        if (typeof value === "string") fields.push([key, value]);
      }

      const btn = form.querySelector<HTMLButtonElement>("button[type=submit], button:not([type])");
      const label = btn?.textContent?.trim() || document.title || "Form";

      const item = enqueue({ pageUrl: window.location.href, action: form.action, fields, label });
      setQueue(getQueue());
      showToast("You're offline — form saved locally. It will be ready to resubmit when you reconnect.");
      // Store reference for auto-fill when user returns
      void item;
    };

    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh, showToast]);

  const retry = useCallback((item: QueuedSubmission) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = item.action;
    form.style.display = "none";
    for (const [name, value] of item.fields) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.requestSubmit();
    document.body.removeChild(form);
    dequeue(item.id);
    refresh();
  }, [refresh]);

  const dismiss = useCallback((id: string) => {
    dequeue(id);
    refresh();
  }, [refresh]);

  const showPanel = isOnline && queue.length > 0;

  return (
    <>
      {toast && (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-sm shadow-lg max-w-sm text-center"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          {toast}
        </div>
      )}

      {showPanel && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-xl text-sm"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--accent)",
            color: "var(--foreground)",
            minWidth: "18rem",
            maxWidth: "26rem",
            width: "calc(100vw - 2rem)",
          }}
        >
          <div
            className="flex items-center justify-between gap-4 px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="font-medium text-xs uppercase tracking-wide" style={{ color: "var(--accent)" }}>
              {queue.length} unsaved {queue.length === 1 ? "form" : "forms"}
            </span>
          </div>
          <ul>
            {queue.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" style={{ color: "var(--foreground)" }}>
                    {item.label}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}
                  >
                    {new URL(item.pageUrl).pathname}
                  </p>
                </div>
                <button
                  onClick={() => retry(item)}
                  className="themed-btn-accent rounded-lg shrink-0 text-xs"
                  style={{ padding: "0.25rem 0.625rem" }}
                >
                  Retry
                </button>
                <button
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 text-base leading-none"
                  style={{ color: "var(--muted-foreground)" }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
