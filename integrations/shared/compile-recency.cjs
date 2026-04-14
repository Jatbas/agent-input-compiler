// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const RECENCY_WINDOW_MS = 120_000;

function recencyFilePath(projectRoot) {
  const hash = crypto.createHash("md5").update(projectRoot).digest("hex").slice(0, 12);
  return path.join(os.tmpdir(), `aic-gate-recent-${hash}`);
}

function writeCompileRecency(projectRoot) {
  try {
    fs.writeFileSync(recencyFilePath(projectRoot), String(Date.now()));
  } catch {
    // Non-fatal
  }
}

function isCompileRecent(projectRoot, windowMs) {
  try {
    const ts = Number(fs.readFileSync(recencyFilePath(projectRoot), "utf8").trim());
    return Date.now() - ts < (windowMs ?? RECENCY_WINDOW_MS);
  } catch {
    return false;
  }
}

module.exports = {
  RECENCY_WINDOW_MS,
  recencyFilePath,
  writeCompileRecency,
  isCompileRecent,
};
