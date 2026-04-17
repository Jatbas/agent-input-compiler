// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const ABI_MARKERS = ["NODE_MODULE_VERSION", "was compiled against a different Node.js"];

export function isAbiMismatch(message: string): boolean {
  return ABI_MARKERS.some((marker) => message.includes(marker));
}

export function formatRemediation(detail: string, nodeVersion: string): string {
  const nodeAbi = process.versions.modules;
  return [
    "AIC: native module ABI mismatch — better-sqlite3 was built for a different Node major than the one running now.",
    `  Current Node: ${nodeVersion} (NODE_MODULE_VERSION ${nodeAbi})`,
    "",
    "Remediation (pick whichever matches how AIC is installed):",
    "  - Dev repo install: rm -rf node_modules && pnpm install",
    "  - Published package: reinstall @jatbas/aic under the current Node (`npx -y @jatbas/aic` refreshes the binary)",
    "  - Globally installed: `npm rebuild better-sqlite3 --prefix <install-dir>` or reinstall the package",
    "",
    "AIC pins Node 24.x (see .nvmrc); running under a different major is unsupported.",
    "",
    `Original error: ${detail}`,
    "",
  ].join("\n");
}

export async function runNativeModulePreflight(): Promise<void> {
  try {
    await import("better-sqlite3");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isAbiMismatch(message)) {
      throw err;
    }
    process.stderr.write(formatRemediation(message, process.version));
    process.exit(1);
  }
}

if (process.env["VITEST"] !== "true") {
  await runNativeModulePreflight();
}
