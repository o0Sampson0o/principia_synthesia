"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

export default function OfflineGuard() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 text-sm shadow-lg border border-amber-200 dark:border-amber-700"
    >
      You are offline. Changes cannot be saved.
    </div>
  );
}
