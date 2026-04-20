// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const ABI_MARKERS = ["NODE_MODULE_VERSION", "was compiled against a different Node.js"];

const MINIMUM_NODE_MAJOR = 22;

export function isAbiMismatch(message: string): boolean {
  return ABI_MARKERS.some((marker) => message.includes(marker));
}

export function parseNodeMajor(version: string): number | null {
  const match = /^v?(\d+)\./.exec(version);
  if (match === null || match[1] === undefined) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function formatNodeVersionError(nodeVersion: string): string {
  return [
    `AIC: unsupported Node.js version — running on ${nodeVersion}, but AIC requires Node.js >= ${MINIMUM_NODE_MAJOR}.`,
    "",
    "Install a supported Node.js (pick one):",
    `  - Homebrew:  brew install node@${MINIMUM_NODE_MAJOR} && echo 'export PATH="/opt/homebrew/opt/node@${MINIMUM_NODE_MAJOR}/bin:$PATH"' >> ~/.zshrc`,
    `  - nvm:       nvm install ${MINIMUM_NODE_MAJOR} && nvm use ${MINIMUM_NODE_MAJOR}`,
    "  - Download:  https://nodejs.org/en/download",
    "",
    "See .nvmrc for the reference Node major used to develop and test AIC.",
    "",
  ].join("\n");
}

export function formatRemediation(detail: string, nodeVersion: string): string {
  const nodeAbi = process.versions.modules;
  return [
    "AIC: native module ABI mismatch — better-sqlite3 was built for a different Node major than the one running now.",
    `  Current Node: ${nodeVersion} (NODE_MODULE_VERSION ${nodeAbi})`,
    "",
    "Most common cause: a stale npx cache from a previous Node major.",
    "  Quick fix (npx users): rm -rf ~/.npm/_npx && npx -y @jatbas/aic@latest",
    "",
    "Other remediations (pick whichever matches how AIC is installed):",
    "  - Dev repo install: rm -rf node_modules && pnpm install",
    "  - Published package: reinstall @jatbas/aic under the current Node (`npx -y @jatbas/aic` refreshes the binary)",
    "  - Globally installed: `npm rebuild better-sqlite3 --prefix <install-dir>` or reinstall the package",
    "",
    `AIC requires Node >= ${MINIMUM_NODE_MAJOR} (see .nvmrc for the reference major used to develop and test).`,
    "",
    `Original error: ${detail}`,
    "",
  ].join("\n");
}

export function runNodeVersionPreflight(): void {
  const major = parseNodeMajor(process.version);
  if (major === null || major >= MINIMUM_NODE_MAJOR) return;
  process.stderr.write(formatNodeVersionError(process.version));
  process.exit(1);
}

export async function runNativeModulePreflight(): Promise<void> {
  try {
    const mod = await import("better-sqlite3");
    const Database = mod.default;
    const probe = new Database(":memory:");
    probe.close();
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
  runNodeVersionPreflight();
  await runNativeModulePreflight();
}
