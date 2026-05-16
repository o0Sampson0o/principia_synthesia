import Image from "next/image";
import { isBlobUrl } from "@/lib/images";

type Props = {
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  title?: string;
};

/**
 * MDX img replacement that uses next/image for Vercel Blob URLs (optimized)
 * and falls back to unoptimized mode for arbitrary external hosts, so existing
 * articles that reference external images continue to work.
 */
export default function ArticleImage({ src, alt, width, height, title }: Props) {
  if (!src) return null;

  const isBlob = isBlobUrl(src);
  const altText = alt ?? "";

  const numWidth = typeof width === "string" ? parseInt(width, 10) : width;
  const numHeight = typeof height === "string" ? parseInt(height, 10) : height;

  // If dimensions are known, render an intrinsic-size image.
  if (numWidth && numHeight && !isNaN(numWidth) && !isNaN(numHeight)) {
    return (
      <figure className="my-6">
        <Image
          src={src}
          alt={altText}
          width={numWidth}
          height={numHeight}
          unoptimized={!isBlob}
          className="rounded-md max-w-full h-auto shadow-sm hover:shadow-md transition-shadow"
        />
        {title ? (
          <figcaption className="text-sm themed-muted mt-2">{title}</figcaption>
        ) : null}
      </figure>
    );
  }

  // No dimensions — use fill inside a responsive 16:9 container.
  return (
    <figure className="my-6">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <Image
          src={src}
          alt={altText}
          fill
          unoptimized={!isBlob}
          sizes="(max-width: 768px) 100vw, 768px"
          className="rounded-md object-contain shadow-sm hover:shadow-md transition-shadow"
        />
      </div>
      {title ? (
        <figcaption className="text-sm themed-muted mt-2">{title}</figcaption>
      ) : null}
    </figure>
  );
}
