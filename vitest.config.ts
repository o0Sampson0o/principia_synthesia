import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      nodemailer: "/home/lagrange/dev/principia-synthesia/tests/__mocks__/nodemailer.ts",
    },
  },
});
