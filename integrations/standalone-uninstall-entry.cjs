// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const claudeFlag = process.argv.includes("--claude");
const cursorFlag = process.argv.includes("--cursor");

process.argv = process.argv.filter((a) => a !== "--claude" && a !== "--cursor");

if (claudeFlag && !cursorFlag) {
  const { run } = require("./claude/uninstall.cjs");
  if (run() === "devmode-skip") process.exit(0);
} else if (cursorFlag && !claudeFlag) {
  const { run } = require("./cursor/uninstall.cjs");
  if (run() === "devmode-skip") process.exit(0);
} else {
  // Default: run both. Cursor pass skips global Claude cleanup to avoid
  // running tryUninstallGlobalClaude twice; the Claude pass handles it.
  const { run: runCursor } = require("./cursor/uninstall.cjs");
  const { run: runClaude } = require("./claude/uninstall.cjs");
  if (runCursor({ skipGlobalClaude: true }) === "devmode-skip") process.exit(0);
  runClaude();
}
