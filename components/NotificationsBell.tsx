"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "@/app/notifications/actions";

type Notification = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

function notificationHref(n: Notification): string {
  const p = n.payload;
  if (n.type === "stale_articles_digest") return "/notifications";
  if (n.type === "article_forked") {
    return `/${p.forkerPublisherSlug}/articles/${p.originalSlug}`;
  }
  if (n.type === "article_cited") {
    return `/${p.citingPublisherSlug}/articles/${p.citingSlug}`;
  }
  return "/notifications";
}

function notificationLabel(n: Notification): string {
  const p = n.payload;
  if (n.type === "stale_articles_digest") {
    const count = p.count as number;
    return `${count} article${count === 1 ? "" : "s"} need verification`;
  }
  if (n.type === "article_forked") {
    return `"${p.originalTitle}" was forked`;
  }
  if (n.type === "article_cited") {
    return `"${p.citedSlug}" was cited in "${p.citingTitle}"`;
  }
  return n.type;
}

const NOW = () => new Date().toISOString();

export default function NotificationsBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications/unread-count")
      .then((r) => r.json())
      .then((d) => setCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleOpen() {
    setOpen((o) => !o);
    if (!open && items.length === 0) {
      setLoadingItems(true);
      try {
        const r = await fetch("/api/notifications/list");
        if (r.ok) {
          const d = await r.json();
          setItems(d.notifications ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoadingItems(false);
      }
    }
  }

  function handleMarkRead(id: number) {
    const fd = new FormData();
    fd.append("notificationId", String(id));
    startTransition(async () => {
      await markNotificationRead(fd);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: NOW() } : n))
      );
      setCount((c) => Math.max(0, c - 1));
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? NOW() })));
      setCount(0);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="themed-nav-link relative flex items-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 themed-surface border themed-border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <div className="px-4 py-2 border-b themed-border flex items-center justify-between">
            <span className="text-sm font-medium themed-heading">Notifications</span>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending || count === 0}
              className="text-xs themed-link disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loadingItems ? (
              <p className="px-4 py-3 text-sm themed-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-3 text-sm themed-muted">No notifications.</p>
            ) : (
              items.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 px-4 py-3 border-b themed-border last:border-b-0 ${n.readAt ? "opacity-60" : ""}`}
                >
                  <Link
                    href={notificationHref(n)}
                    className="flex-1 text-sm themed-link leading-snug"
                    onClick={() => setOpen(false)}
                  >
                    {notificationLabel(n)}
                  </Link>
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(n.id)}
                      disabled={isPending}
                      className="text-xs themed-muted hover:themed-link shrink-0 disabled:opacity-40"
                      aria-label="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t themed-border">
            <Link href="/notifications" className="text-xs themed-link" onClick={() => setOpen(false)}>
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
