import { isValidLicense } from "@/lib/license";

export default async function LicensePage() {
  const key = process.env.LICENSE_KEY ?? null;

  if (!key) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-6">License</h1>
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            No license key configured. Set{" "}
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
              LICENSE_KEY
            </code>{" "}
            in{" "}
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
              .env.local
            </code>{" "}
            to enable paid features.
          </p>
        </div>
      </main>
    );
  }

  const payload = await isValidLicense(key);

  if (!payload) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-6">License</h1>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-8">
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            License key is invalid or expired.
          </p>
        </div>
      </main>
    );
  }

  const expiry = payload.exp
    ? new Date(payload.exp * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "No expiry";

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">License</h1>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Status</span>
          <span className="text-sm font-medium text-green-600 dark:text-green-400">Valid</span>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Tier</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
            {payload.tier}
          </span>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Licensee</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {payload.sub}
          </span>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Expires</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{expiry}</span>
        </div>
        <div className="p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">Features</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {payload.features.map((f) => (
              <span
                key={f}
                className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
