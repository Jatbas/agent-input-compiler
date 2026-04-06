// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");

function getAicDir(projectRoot) {
  return path.join(projectRoot, ".aic");
}

function ensureAicDir(projectRoot) {
  const dir = path.join(projectRoot, ".aic");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function appendJsonl(projectRoot, filename, entry) {
  try {
    ensureAicDir(projectRoot);
    const filePath = path.join(projectRoot, ".aic", filename);
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}

module.exports = { getAicDir, ensureAicDir, appendJsonl };
