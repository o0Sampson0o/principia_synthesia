"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

export default function OfflineGuard() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="alert"
      className="ps-notice fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-sm"
      style={{ boxShadow: "0 10px 34px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.06)" }}
    >
      You are offline. Changes cannot be saved.
    </div>
  );
}
