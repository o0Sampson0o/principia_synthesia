"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast, type ToastVariant } from "@/lib/toast";

/**
 * Bridges the redirect-with-`?error=` server pattern into the toast system:
 * fires the (server-resolved) message as a toast on arrival, then strips the
 * error params from the URL so a refresh doesn't re-announce it. Renders
 * nothing — the page layout is never touched.
 */
export default function SearchParamToast({
  message,
  title,
  variant = "error",
  clearParams = ["error"],
}: {
  message: string | null | undefined;
  title?: string;
  variant?: ToastVariant;
  clearParams?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (!message || fired.current) return;
    fired.current = true;
    toast(message, { title: title ?? (variant === "error" ? "Not saved" : undefined), variant });

    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const key of clearParams) {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  return null;
}
