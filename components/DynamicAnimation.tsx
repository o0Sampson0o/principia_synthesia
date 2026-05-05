"use client";

import { useState } from "react";

export default function DynamicAnimation({ slug }: { slug: string }) {
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
      <iframe
        src={`/api/animations/${slug}/preview`}
        className="border-0 w-full h-[400px]"
        title={`Animation: ${slug}`}
        onError={() => setError(true)}
      />
    </div>
  );
}
