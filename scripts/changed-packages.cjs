// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Prints which packages changed relative to origin/main.
// Output is one of: "mcp", "shared", "both"
// Falls back to "both" on any error so the full suite always runs safely.
const { execSync } = require("child_process");

function changedPackages() {
  try {
    const diff = execSync("git diff --name-only origin/main...HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const files = diff.split("\n").filter(Boolean);
    // no commits yet on this branch — run everything
    if (files.length === 0) return "both";
    const mcpChanged = files.some((f) => f.startsWith("mcp/"));
    const sharedChanged = files.some((f) => f.startsWith("shared/"));
    if (mcpChanged && sharedChanged) return "both";
    if (mcpChanged) return "mcp";
    if (sharedChanged) return "shared";
    // only non-src files changed (config, docs, hooks) — run everything
    return "both";
  } catch {
    return "both";
  }
}

process.stdout.write(changedPackages() + "\n");
