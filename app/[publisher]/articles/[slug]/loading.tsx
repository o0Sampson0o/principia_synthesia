/**
 * Route-level skeleton for the article reading page: the header/prose shapes
 * appear instantly while the server resolves the article, citations, and
 * discussion. Tone-on-tone blocks per the Hairline Rule — no spinners.
 */
export default function Loading() {
  return (
    <main className="w-full max-w-3xl mx-auto px-5 py-12 sm:py-16" aria-busy="true">
      <span className="sr-only">Loading article…</span>
      <div className="animate-pulse" aria-hidden="true">
        {/* Breadcrumb */}
        <div className="h-3 w-28 rounded themed-muted-bg mb-8" />
        {/* Title */}
        <div className="h-9 w-4/5 rounded themed-muted-bg mb-3" />
        <div className="h-9 w-3/5 rounded themed-muted-bg mb-6" />
        {/* Summary */}
        <div className="h-4 w-full rounded themed-muted-bg mb-2" />
        <div className="h-4 w-2/3 rounded themed-muted-bg mb-8" />
        {/* Meta row */}
        <div className="h-3 w-52 rounded themed-muted-bg mb-12" />
        {/* Prose */}
        <div className="space-y-3">
          <div className="h-4 w-full rounded themed-muted-bg" />
          <div className="h-4 w-full rounded themed-muted-bg" />
          <div className="h-4 w-11/12 rounded themed-muted-bg" />
          <div className="h-4 w-full rounded themed-muted-bg" />
          <div className="h-4 w-3/4 rounded themed-muted-bg" />
        </div>
      </div>
    </main>
  );
}
