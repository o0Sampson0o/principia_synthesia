"use client";
import { useEffect, useState } from "react";

export default function OfflineGuard() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 text-sm shadow-lg border border-amber-200 dark:border-amber-700"
    >
      You are offline. Changes cannot be saved.
    </div>
  );
}
