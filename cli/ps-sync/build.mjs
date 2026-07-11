// Bundles the ps-sync CLI into a single self-contained ESM file served from
// /ps-sync.mjs on the site, so end users need nothing but Node 18+:
//
//   curl -O https://<server>/ps-sync.mjs
//   node ps-sync.mjs init
//
// Runs as the app's `prebuild` step, so every deploy ships a CLI matching its
// own API.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

// Bake the producing site's URL into the bundle so `init` doesn't have to ask
// where the CLI came from. On Vercel, VERCEL_PROJECT_PRODUCTION_URL is the
// project's production domain; PS_SYNC_SERVER_URL overrides it explicitly.
const defaultServer =
  process.env.PS_SYNC_SERVER_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "");

await build({
  entryPoints: [join(dir, "src", "index.ts")],
  outfile: join(dir, "..", "..", "public", "ps-sync.mjs"),
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
      "// Usage: node ps-sync.mjs help   ·   Requires Node 18+.",
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
