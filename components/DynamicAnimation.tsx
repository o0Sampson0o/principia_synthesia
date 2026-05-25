"use client";

import { useState } from "react";
import Link from "next/link";
import { useAnimationSrc } from "@/lib/useAnimationSrc";

interface DynamicAnimationProps {
  /** Publisher slug that owns this animation object. */
  publisher: string;
  /** Animation object slug (must start with `anim-`). */
  slug: string;
}

export default function DynamicAnimation({ publisher, slug }: DynamicAnimationProps) {
  const [error, setError] = useState(false);
  const src = useAnimationSrc(publisher, slug);

  if (error) {
    return (
      <div className="my-6 p-4 border border-red-200 rounded text-red-500 text-sm">
        Failed to load animation: {slug}
      </div>
    );
  }

  return (
    <div className="my-6">
      {src && (
        <iframe
          src={src}
          sandbox="allow-scripts"
          className="w-full border-0"
          style={{ height: "400px" }}
          title={`Animation: ${slug}`}
          onError={() => setError(true)}
        />
      )}
      <div className="mt-2 text-right">
        <Link
          href={`/${publisher}/objects/${slug}`}
          className="text-xs themed-muted themed-hover-foreground transition-colors"
        >
          View animation →
        </Link>
      </div>
    </div>
  );
}
