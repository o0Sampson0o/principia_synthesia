"use client";

import { useActionState, useTransition } from "react";
import { scanPlugins, installPlugin, uninstallPlugin } from "./actions";
import type { ScanDiscovery } from "./actions";

// ─── InstallButton ────────────────────────────────────────────────────────────

interface InstallButtonProps {
  slug: string;
  label: "Install" | "Update";
}

function InstallButton({ slug, label }: InstallButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await installPlugin(slug);
      window.location.reload();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs px-2 py-1 rounded bg-zinc-800 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {isPending ? "Installing…" : label}
    </button>
  );
}

// ─── UninstallButton ──────────────────────────────────────────────────────────

interface UninstallButtonProps {
  slug: string;
}

function UninstallButton({ slug }: UninstallButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Uninstall plugin "${slug}"?`)) return;
    startTransition(async () => {
      await uninstallPlugin(slug);
      window.location.reload();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-red-600 hover:text-red-800 underline underline-offset-2 disabled:opacity-50"
    >
      {isPending ? "Uninstalling…" : "Uninstall"}
    </button>
  );
}

// ─── ScanButton ───────────────────────────────────────────────────────────────

export { UninstallButton };

export default function ScanButton() {
  const [result, dispatch, isPending] = useActionState(
    async (_prev: ScanDiscovery | null): Promise<ScanDiscovery | null> => scanPlugins(),
    null,
  );

  return (
    <div className="space-y-4">
      <form action={dispatch}>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm rounded bg-zinc-800 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? "Scanning…" : "Scan plugins/"}
        </button>
      </form>

      {result && (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm space-y-3">
          {"warning" in result && (
            <p className="text-amber-600">{result.warning}</p>
          )}
          {"error" in result && (
            <p className="text-red-600">{result.error}</p>
          )}
          {"plugins" in result && (
            <>
              {result.plugins.length === 0 && result.skipped.length === 0 && (
                <p className="text-zinc-500">No plugins found.</p>
              )}
              {result.plugins.length > 0 && (
                <ul className="space-y-2">
                  {result.plugins.map((plugin) => (
                    <li
                      key={plugin.slug}
                      className="flex items-center justify-between gap-4 rounded border border-zinc-100 dark:border-zinc-800 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{plugin.name}</span>
                        <span className="ml-2 font-mono text-xs text-zinc-400">
                          {plugin.slug}
                        </span>
                        <span className="ml-2 text-xs text-zinc-400">v{plugin.version}</span>
                        {plugin.status === "installed" && (
                          <span className="ml-2 text-xs text-green-700 dark:text-green-400 font-semibold">
                            Installed
                          </span>
                        )}
                        {plugin.status === "update_available" && (
                          <span className="ml-2 text-xs text-amber-600 font-semibold">
                            Update available
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {plugin.status === "not_installed" && (
                          <InstallButton slug={plugin.slug} label="Install" />
                        )}
                        {plugin.status === "update_available" && (
                          <InstallButton slug={plugin.slug} label="Update" />
                        )}
                        {(plugin.status === "installed" || plugin.status === "update_available") && (
                          <UninstallButton slug={plugin.slug} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                    Skipped
                  </p>
                  <ul className="space-y-1">
                    {result.skipped.map((s) => (
                      <li key={s.slug} className="text-amber-700 text-xs">
                        <span className="font-mono">{s.slug}</span>: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
