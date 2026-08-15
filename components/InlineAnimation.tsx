import InlineAnimationFrame from "@/components/InlineAnimationFrame";

interface InlineAnimationProps {
  /** The animation code, from a ```animation fence. */
  code: string;
  /** Frame height from the fence meta (`​```animation height=520`). */
  height?: string | number;
}

/**
 * A ```animation fence, rendered.
 *
 * The article-facing counterpart of `<DynamicAnimation>`: same frame, same
 * spacing, no "View animation" link — inline code has no object page to link
 * to. Authors reach for this when an animation belongs to one article and does
 * not need to exist as a reusable object.
 */
export default function InlineAnimation({ code, height }: InlineAnimationProps) {
  return (
    <div className="my-6">
      <InlineAnimationFrame
        code={code}
        height={typeof height === "string" ? Number(height) : height}
        className="w-full border-0"
      />
    </div>
  );
}
