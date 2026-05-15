"use client";
import { useState, useTransition } from "react";
import { setResourceVisibility } from "@/app/admin/access/actions";

export function VisibilityToggle({
  bookSlug,
  isPrivate,
}: {
  bookSlug: string;
  isPrivate: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [currentlyPrivate, setCurrentlyPrivate] = useState(isPrivate);

  function toggle() {
    const next = !currentlyPrivate;
    setCurrentlyPrivate(next);
    const fd = new FormData();
    fd.set("resourceType", "book");
    fd.set("resourceKey", bookSlug);
    fd.set("isPrivate", next ? "true" : "false");
    startTransition(() => setResourceVisibility(fd));
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        disabled={isPending}
        aria-label={currentlyPrivate ? "Make public" : "Make private"}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          currentlyPrivate ? "bg-amber-500" : "bg-green-500"
        } ${isPending ? "opacity-60" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            currentlyPrivate ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm">
        {currentlyPrivate
          ? "Private — only granted users can access"
          : "Public — visible to everyone"}
      </span>
    </div>
  );
}
