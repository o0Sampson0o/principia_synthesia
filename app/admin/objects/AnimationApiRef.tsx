"use client";

const TOKENS = [
  ["background",       "Canvas/page background"],
  ["foreground",       "Primary text and line color"],
  ["muted",            "Subtle background (panels, fills)"],
  ["mutedForeground",  "Secondary / de-emphasised text"],
  ["border",           "Border and divider lines"],
  ["surface",          "Card or surface background"],
  ["surfaceHover",     "Hovered surface"],
  ["primaryBtn",       "Primary button background"],
  ["primaryBtnText",   "Primary button text"],
  ["secondaryText",    "Tertiary text"],
  ["link",             "Link color"],
  ["linkHover",        "Hovered link color"],
  ["codeBackground",   "Code block background"],
  ["inputBorder",      "Input border"],
  ["inputFocusBorder", "Focused input border"],
] as const;

const EXAMPLE = `function MyAnimation() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // Resize canvas to fill the iframe
  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();

  // Use theme tokens — automatically switch on dark mode
  const bg  = window.theme.background;
  const fg  = window.theme.foreground;
  const accent = window.theme.primaryBtn;

  let t = 0;

  function draw() {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // your drawing here
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    // ...

    t += 0.016;
    requestAnimationFrame(draw);
  }

  draw();
}`;

export default function AnimationApiRef() {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm">
      <summary className="cursor-pointer px-4 py-2.5 font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 select-none">
        Animation API reference
      </summary>

      <div className="px-4 pb-4 pt-2 space-y-5 border-t border-zinc-100 dark:border-zinc-800">

        {/* Structure */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Structure</h3>
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-2">
            Write a named function. The runtime calls it automatically after the page loads.
            The canvas element (<code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">id=&quot;canvas&quot;</code>) is already in the DOM,
            sized to fill the iframe.
          </p>
          <pre className="bg-zinc-50 dark:bg-zinc-800 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre">{EXAMPLE}</pre>
        </section>

        {/* Theme tokens */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
            <code className="normal-case font-mono">window.theme</code> tokens
          </h3>
          <p className="text-zinc-600 dark:text-zinc-300 mb-2">
            Each token is a hex color string that reflects the user&apos;s active theme.{" "}
            <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">window.theme</code> switches automatically when the system dark-mode preference changes.
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-zinc-400 dark:text-zinc-500">
                <th className="pb-1 pr-4 font-semibold">Token</th>
                <th className="pb-1 font-semibold">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {TOKENS.map(([token, desc]) => (
                <tr key={token} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1 pr-4 font-mono text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                    window.theme.<span className="text-violet-600 dark:text-violet-400">{token}</span>
                  </td>
                  <td className="py-1 text-zinc-500 dark:text-zinc-400">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Restrictions */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Restrictions</h3>
          <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-300">
            <li><code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">eval</code> and <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">new Function()</code> are not allowed.</li>
            <li><code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">import</code> and <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">require</code> are not allowed — all code must be self-contained.</li>
            <li>No access to the parent page DOM or cookies — the animation runs in an isolated iframe.</li>
          </ul>
        </section>

      </div>
    </details>
  );
}
