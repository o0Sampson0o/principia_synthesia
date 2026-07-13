// Shared esbuild bundler for the ps-sync CLI. Produces a single self-contained
// ESM file (gray-matter inlined) that needs nothing but Node 18+.
//
// Two consumers:
//   - build.mjs        → public/ps-sync.mjs, server URL baked in (site download)
//   - npm prepublish   → dist/ps-sync.mjs, no baked server (init prompts)
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

/**
 * @param {object} opts
 * @param {string} opts.outfile      Absolute path to write the bundle to.
 * @param {string} [opts.defaultServer]  Baked-in server URL (empty → init prompts).
 */
export async function bundleCli({ outfile, defaultServer = "" }) {
  await build({
    entryPoints: [join(dir, "src", "index.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    define: {
      "process.env.PS_SYNC_DEFAULT_SERVER": JSON.stringify(defaultServer),
    },
    banner: {
      js: [
        "#!/usr/bin/env node",
        "// ps-sync — Principia Synthesia local sync CLI (self-contained build).",
        "// Usage: ps-sync help   ·   Requires Node 18+.",
        // CJS deps (gray-matter) require() Node builtins; give the ESM bundle a
        // real require so esbuild's dynamic-require shim resolves them.
        'import { createRequire as __createRequire } from "node:module";',
        "const require = __createRequire(import.meta.url);",
      ].join("\n"),
    },
    legalComments: "none",
    minify: false,
    logLevel: "info",
  });
}
