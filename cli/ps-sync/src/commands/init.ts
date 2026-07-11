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

  // Baked in at build time (the site the CLI was downloaded from), so most
  // users never have to answer a server question at all.
  const bakedServer = process.env.PS_SYNC_DEFAULT_SERVER || "";

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let server = values.server ?? bakedServer;
    if (server) {
      console.log(`Server: ${server}${values.server ? "" : " (override with --server <url>)"}`);
    } else {
      server = await rl.question("Server URL (e.g. https://your-site.com): ");
    }
    server = server.trim();
    if (server.startsWith("pst_")) {
      console.error(
        "That looks like an API token, not a server URL. The server is the website address (https://...)."
      );
      return 1;
    }
    if (server && !/^https?:\/\//.test(server)) server = `https://${server}`;

    const token =
      values.token ??
      process.env.PS_SYNC_TOKEN ??
      (await rl.question("API token (create one at Settings → API tokens): "));
    if (!token.trim().startsWith("pst_")) {
      console.error('That does not look like an API token (tokens start with "pst_").');
      return 1;
    }

    const api = new ApiClient(server, token.trim());
    const me = await api.me();
    // Persist the post-redirect canonical origin (e.g. apex → www).
    server = api.baseUrl;
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
      server: server.replace(/\/+$/, ""),
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
