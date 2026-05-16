"use client";

import { useState } from "react";
import Link from "next/link";
import { useAnimationSrc } from "@/lib/useAnimationSrc";

export default function DynamicAnimation({ slug }: { slug: string }) {
  const [error, setError] = useState(false);
  const src = useAnimationSrc(slug);

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
          className="w-full border-0"
          style={{ height: "400px" }}
          title={`Animation: ${slug}`}
          onError={() => setError(true)}
        />
      )}
      <div className="mt-2 text-right">
        <Link
          href={`/objects/${slug}`}
          className="text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
        >
          View animation →
        </Link>
      </div>
    </div>
  );
}
