// Bundles the ps-sync CLI to dist/ps-sync.mjs for npm publishing. No server URL
// is baked in (the published package isn't tied to one site), so `init` prompts
// for the server. Run automatically via `prepublishOnly`.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { bundleCli } from "./bundle.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(dir, "dist"), { recursive: true });

await bundleCli({
  outfile: join(dir, "dist", "ps-sync.mjs"),
  defaultServer: "",
});
