// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");

function sanitize(str) {
  return String(str).replace(/[^a-zA-Z0-9*_-]/g, "_");
}

function getTempPath(editorId, key) {
  return path.join(
    os.tmpdir(),
    "aic-edited-" + sanitize(editorId) + "-" + sanitize(key) + ".json",
  );
}

function readEditedFiles(editorId, key) {
  const tmpPath = getTempPath(editorId, key);
  if (!fs.existsSync(tmpPath)) return [];
  try {
    const raw = fs.readFileSync(tmpPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}

function writeEditedFiles(editorId, key, paths) {
  const existing = readEditedFiles(editorId, key);
  const merged = [...new Set([...existing, ...paths])].filter(
    (p) => typeof p === "string" && p.length > 0,
  );
  fs.writeFileSync(getTempPath(editorId, key), JSON.stringify(merged), "utf8");
}

function cleanupEditedFiles(editorId, key) {
  try {
    fs.unlinkSync(getTempPath(editorId, key));
  } catch {
    // ignore ENOENT or other errors
  }
}

module.exports = {
  getTempPath,
  readEditedFiles,
  writeEditedFiles,
  cleanupEditedFiles,
};
