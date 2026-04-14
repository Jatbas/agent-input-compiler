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

function turnMarkerPath(projectRoot, conversationId, kind) {
  const hash = crypto
    .createHash("md5")
    .update(`${projectRoot}\0${conversationId}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `aic-turn-${kind}-${hash}`);
}

function writeTurnStart(projectRoot, conversationId) {
  try {
    fs.writeFileSync(
      turnMarkerPath(projectRoot, conversationId, "start"),
      String(Date.now()),
    );
  } catch {
    // Non-fatal
  }
}

function writeTurnCompiled(projectRoot, conversationId) {
  try {
    fs.writeFileSync(
      turnMarkerPath(projectRoot, conversationId, "compiled"),
      String(Date.now()),
    );
  } catch {
    // Non-fatal
  }
}

function isTurnCompiled(projectRoot, conversationId) {
  try {
    const start = Number(
      fs
        .readFileSync(turnMarkerPath(projectRoot, conversationId, "start"), "utf8")
        .trim(),
    );
    const compiled = Number(
      fs
        .readFileSync(turnMarkerPath(projectRoot, conversationId, "compiled"), "utf8")
        .trim(),
    );
    return Number.isFinite(start) && Number.isFinite(compiled) && compiled >= start;
  } catch {
    return false;
  }
}

module.exports = {
  RECENCY_WINDOW_MS,
  recencyFilePath,
  turnMarkerPath,
  writeCompileRecency,
  isCompileRecent,
  writeTurnStart,
  writeTurnCompiled,
  isTurnCompiled,
};
