// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const claudeIdx = process.argv.indexOf("--claude");
if (claudeIdx >= 0) {
  process.argv.splice(claudeIdx, 1);
  require("./claude/uninstall.cjs");
} else {
  require("./cursor/uninstall.cjs");
}
