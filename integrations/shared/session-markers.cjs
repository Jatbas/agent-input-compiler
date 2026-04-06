// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");

function aicDir(projectRoot) {
  return path.join(projectRoot, ".aic");
}

function lockPath(projectRoot) {
  return path.join(projectRoot, ".aic", ".session-start-lock");
}

function markerPath(projectRoot) {
  return path.join(projectRoot, ".aic", ".session-context-injected");
}

function acquireSessionLock(projectRoot) {
  const dir = aicDir(projectRoot);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return false;
  }
  const lock = lockPath(projectRoot);
  try {
    const fd = fs.openSync(lock, "wx");
    fs.closeSync(fd);
    return true;
  } catch {
    const marker = markerPath(projectRoot);
    if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim().length > 0) {
      try {
        fs.unlinkSync(lock);
      } catch {
        // ignore
      }
    }
    return false;
  }
}

function releaseSessionLock(projectRoot) {
  const lock = lockPath(projectRoot);
  try {
    fs.unlinkSync(lock);
  } catch {
    // ignore
  }
}

function writeSessionMarker(projectRoot, sessionId) {
  const dir = aicDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const marker = markerPath(projectRoot);
  fs.writeFileSync(marker, sessionId ?? "", "utf8");
}

function readSessionMarker(projectRoot) {
  const marker = markerPath(projectRoot);
  if (fs.existsSync(marker)) {
    return fs.readFileSync(marker, "utf8").trim();
  }
  return "";
}

function clearSessionMarker(projectRoot) {
  const marker = markerPath(projectRoot);
  try {
    fs.unlinkSync(marker);
  } catch {
    // ignore
  }
}

function isSessionAlreadyInjected(projectRoot, sessionId) {
  return sessionId != null && readSessionMarker(projectRoot) === sessionId;
}

module.exports = {
  acquireSessionLock,
  releaseSessionLock,
  writeSessionMarker,
  readSessionMarker,
  clearSessionMarker,
  isSessionAlreadyInjected,
};
