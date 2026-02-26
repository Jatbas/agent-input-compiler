import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@aic/shared": resolve(__dirname, "shared/src"),
      "@aic/cli": resolve(__dirname, "cli/src"),
      "@aic/mcp": resolve(__dirname, "mcp/src"),
    },
  },
  test: {
    include: ["shared/src/**/*.test.ts", "cli/src/**/*.test.ts", "mcp/src/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["shared/src/**/*.ts", "cli/src/**/*.ts", "mcp/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.test.ts", "**/index.ts"],
    },
  },
});
