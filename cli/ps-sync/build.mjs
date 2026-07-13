// Bundles the ps-sync CLI to public/ps-sync.mjs so end users can download and
// run it with nothing but Node 18+:
//
//   curl -O https://<server>/ps-sync.mjs
//   node ps-sync.mjs init
//
// Runs as the app's `prebuild` step, so every deploy ships a CLI matching its
// own API, with the producing site's URL baked in.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bundleCli } from "./bundle.mjs";

const dir = dirname(fileURLToPath(import.meta.url));

// On Vercel, VERCEL_PROJECT_PRODUCTION_URL is the project's production domain;
// PS_SYNC_SERVER_URL overrides it explicitly.
const defaultServer =
  process.env.PS_SYNC_SERVER_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "");

await bundleCli({
  outfile: join(dir, "..", "..", "public", "ps-sync.mjs"),
  defaultServer,
});
