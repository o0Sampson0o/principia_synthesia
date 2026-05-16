"use client";

import { useAnimationSrc } from "@/lib/useAnimationSrc";

export default function AnimationPreview({
  publisher,
  slug,
}: {
  publisher: string;
  slug: string;
}) {
  const src = useAnimationSrc(publisher, slug);

  return (
    <div className="themed-border border rounded p-4 themed-surface">
      <p className="text-xs themed-muted mb-2">Preview:</p>
      {src && (
        <iframe
          src={src}
          className="w-full border-0"
          style={{ height: "400px" }}
          title={`Animation: ${slug}`}
        />
      )}
    </div>
  );
}
