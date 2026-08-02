"use client";

import AnimationFrame from "@/components/AnimationFrame";

export default function AnimationPreview({
  publisher,
  slug,
}: {
  publisher: string;
  slug: string;
}) {
  return (
    <div className="themed-border border rounded p-4 themed-surface">
      <p className="text-xs themed-muted mb-2">Preview:</p>
      <AnimationFrame publisher={publisher} slug={slug} className="w-full border-0" />
    </div>
  );
}
