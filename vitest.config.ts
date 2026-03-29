import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// CHANGED_PKGS is set by .husky/pre-push via scripts/changed-packages.cjs.
// Absent (manual `pnpm test` or CI) → full suite.
const changed = process.env["CHANGED_PKGS"] ?? "both";
const mcpOnly = changed === "mcp";
const sharedOnly = changed === "shared";

// Integration tests always run — they exercise contracts across both packages.
// Benchmarks are only relevant when shared/pipeline/ logic changes.
const include: string[] = [];
if (!sharedOnly) {
  include.push("mcp/src/**/__tests__/**/*.test.ts");
}
if (!mcpOnly) {
  include.push("shared/src/**/__tests__/**/*.test.ts");
} else {
  // mcp-only: still run integration tests (cross-package contracts), skip benchmarks
  include.push("shared/src/integration/__tests__/!(*.benchmark*|*benchmark*).test.ts");
}

export default defineConfig({
  resolve: {
    alias: {
      "@jatbas/aic-core": resolve(__dirname, "shared/src"),
      "@jatbas/aic": resolve(__dirname, "mcp/src"),
    },
  },
  test: {
    watch: false,
    testTimeout: 30_000,
    maxWorkers: 4,
    include,
    globals: false,
    coverage: {
      provider: "v8",
      include: ["shared/src/**/*.ts", "mcp/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.test.ts", "**/index.ts"],
    },
  },
});
