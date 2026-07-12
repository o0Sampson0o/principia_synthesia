import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      // Playwright specs run via `npm run test:e2e`, not vitest
      "tests/e2e/**",
      // agent worktrees may contain stale copies of the repo
      "**/.claude/**",
    ],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      nodemailer: "/home/lagrange/dev/principia-synthesia/tests/__mocks__/nodemailer.ts",
    },
  },
});
