"use client";

import Link from "next/link";
import { useAnimationSrc } from "@/lib/useAnimationSrc";

interface Props {
  slug: string;
  name: string;
  isAdmin: boolean;
}

export default function AnimationCard({ slug, name, isAdmin }: Props) {
  const src = useAnimationSrc(slug);

  return (
    <div className="group block themed-border border rounded-xl overflow-hidden hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
      <Link href={`/animations/${slug}`} className="block">
        <div className="relative themed-surface" style={{ height: "200px" }}>
          {src && (
            <iframe
              src={src}
              className="w-full h-full border-0 pointer-events-none"
              title={name}
              loading="lazy"
            />
          )}
        </div>
      </Link>
      <div className="px-4 py-3 themed-border border-t flex items-center justify-between">
        <Link href={`/animations/${slug}`} className="block flex-1 min-w-0">
          <p className="text-sm font-medium themed-heading hover:opacity-80 transition-opacity">
            {name}
          </p>
          <p className="text-xs themed-muted font-mono mt-0.5">{slug}</p>
        </Link>
        {isAdmin && (
          <Link
            href={`/admin/animations/${slug}`}
            className="text-xs themed-muted hover:themed-secondary transition-colors ml-4 shrink-0"
          >
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}
