import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { ApiClient } from "../api";
import { ensureGitignore, saveConfig, saveToken, CONFIG_FILE, STATE_DIR } from "../config";

export async function init(root: string, argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      server: { type: "string" },
      token: { type: "string" },
      publishers: { type: "string" },
      extension: { type: "string", default: "md" },
      links: { type: "string", default: "markdown" },
    },
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const server =
      values.server ?? (await rl.question("Server URL (e.g. https://your-site.com): "));
    const token =
      values.token ??
      process.env.PS_SYNC_TOKEN ??
      (await rl.question("API token (create one at Settings → API tokens): "));

    const api = new ApiClient(server, token.trim());
    const me = await api.me();
    console.log(`\nAuthenticated as ${me.email}`);
    console.log(
      `Available publishers: ${me.publishers.map((p) => `${p.slug} (${p.kind})`).join(", ")}`
    );

    let publishers: string[];
    if (values.publishers) {
      publishers = values.publishers.split(",").map((s) => s.trim()).filter(Boolean);
      const known = new Set(me.publishers.map((p) => p.slug));
      const unknown = publishers.filter((p) => !known.has(p));
      if (unknown.length > 0) {
        console.warn(
          `Warning: not listed for this token (may still work if permissions allow): ${unknown.join(", ")}`
        );
      }
    } else {
      const answer = await rl.question(
        `Publishers to sync (comma-separated) [${me.publisherSlug}]: `
      );
      publishers = (answer.trim() || me.publisherSlug).split(",").map((s) => s.trim()).filter(Boolean);
    }

    saveConfig(root, {
      server: server.trim().replace(/\/+$/, ""),
      publishers,
      extension: values.extension || "md",
      links: values.links === "wikilink" ? "wikilink" : "markdown",
    });
    saveToken(root, token.trim());
    ensureGitignore(root);

    console.log(`\nWrote ${CONFIG_FILE} and ${STATE_DIR}/token.`);
    console.log(`Next: run "ps-sync pull" to download your articles.`);
    return 0;
  } finally {
    rl.close();
  }
}
