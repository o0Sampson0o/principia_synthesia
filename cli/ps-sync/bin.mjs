#!/usr/bin/env node
// Launcher: runs the TypeScript sources via tsx so no build step is needed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const child = spawn(
  "npx",
  ["-y", "tsx", join(dir, "src", "index.ts"), ...process.argv.slice(2)],
  { stdio: "inherit", shell: process.platform === "win32" }
);
child.on("exit", (code) => process.exit(code ?? 1));
