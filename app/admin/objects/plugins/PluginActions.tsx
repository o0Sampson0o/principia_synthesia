"use client";

import { useActionState, useTransition } from "react";
import { scanAndInstallPlugins, uninstallPlugin, type ScanResult } from "./actions";

type ScanState = ScanResult | null;

const initialState: ScanState = null;

async function scanAction(_prev: ScanState): Promise<ScanState> {
  return scanAndInstallPlugins();
}

interface UninstallButtonProps {
  slug: string;
  onUninstalled?: () => void;
}

function UninstallButton({ slug }: UninstallButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Uninstall plugin "${slug}"?`)) return;
    startTransition(async () => {
      await uninstallPlugin(slug);
      // Reload to refresh the server-rendered list
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

interface Props {
  installedSlugs: string[];
}

export { UninstallButton };

export default function ScanButton() {
  const [result, dispatch, isPending] = useActionState(scanAction, initialState);

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
        <div className="rounded-lg border border-zinc-200 p-4 text-sm space-y-2">
          {"warning" in result && (
            <p className="text-amber-600">{result.warning}</p>
          )}
          {"error" in result && (
            <p className="text-red-600">{result.error}</p>
          )}
          {"installed" in result && (
            <>
              {result.installed.length > 0 ? (
                <p className="text-green-700">
                  Installed: {result.installed.join(", ")}
                </p>
              ) : (
                <p className="text-zinc-500">No new plugins installed.</p>
              )}
              {result.skipped.length > 0 && (
                <ul className="space-y-1">
                  {result.skipped.map((s) => (
                    <li key={s.slug} className="text-amber-700">
                      Skipped <span className="font-mono">{s.slug}</span>: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
