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
  const rootReal = fs.realpathSync(projectRoot);
  const aicReal = fs.realpathSync(dir);
  const rel = path.relative(rootReal, aicReal);
  if (rel.length === 0 || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("invalid project .aic directory");
  }
  return aicReal;
}

function appendJsonl(projectRoot, filename, entry) {
  try {
    if (String(filename).includes("..")) {
      return;
    }
    const base = ensureAicDir(projectRoot);
    const filePath = path.join(base, filename);
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}

module.exports = { getAicDir, ensureAicDir, appendJsonl };
