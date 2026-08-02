"use client";

import { useState } from "react";
import Link from "next/link";
import AnimationFrame from "@/components/AnimationFrame";

interface DynamicAnimationProps {
  /** Publisher slug that owns this animation object. */
  publisher: string;
  /** Animation object slug (must start with `anim-`). */
  slug: string;
}

export default function DynamicAnimation({ publisher, slug }: DynamicAnimationProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="my-6 p-4 border border-red-200 rounded text-red-500 text-sm">
        Failed to load animation: {slug}
      </div>
    );
  }

  return (
    <div className="my-6">
      {/* Frame height comes from the animation object — see lib/animation-dimensions.ts */}
      <AnimationFrame
        publisher={publisher}
        slug={slug}
        className="w-full border-0"
        onError={() => setError(true)}
      />
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
