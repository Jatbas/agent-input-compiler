// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");

function isDevModeTrue(projectRoot) {
  const configPath = path.join(projectRoot, "aic.config.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.devMode === true;
  } catch {
    return false;
  }
}

// Emergency bypass: requires BOTH devMode AND skipCompileGate in aic.config.json.
function isCompileGateSkipped(projectRoot) {
  const configPath = path.join(projectRoot, "aic.config.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.devMode === true && parsed.skipCompileGate === true;
  } catch {
    return false;
  }
}

module.exports = { isDevModeTrue, isCompileGateSkipped };
