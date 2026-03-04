import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@aic/shared": resolve(__dirname, "shared/src"),
      "@aic/mcp": resolve(__dirname, "mcp/src"),
    },
  },
  test: {
    watch: false,
    include: [
      "shared/src/**/__tests__/**/*.test.ts",
      "mcp/src/**/__tests__/**/*.test.ts",
    ],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["shared/src/**/*.ts", "mcp/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.test.ts", "**/index.ts"],
    },
  },
});
