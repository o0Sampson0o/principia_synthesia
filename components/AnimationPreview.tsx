export default function AnimationPreview({ slug }: { slug: string }) {
  return (
    <div className="border rounded p-4 bg-zinc-50 dark:bg-zinc-900">
      <p className="text-xs text-zinc-400 mb-2">Preview:</p>
      <iframe
        src={`/api/animations/${slug}`}
        className="w-full border-0"
        style={{ height: '400px' }}
        title={`Animation: ${slug}`}
      />
    </div>
  );
}
