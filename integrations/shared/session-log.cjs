// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const {
  isValidPromptLogReason,
  isValidTimestamp,
} = require("./cache-field-validators.cjs");

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

function appendSessionLog(projectRoot, entry) {
  if (
    typeof entry.session_id !== "string" ||
    entry.session_id.length > 128 ||
    !PRINTABLE_ASCII.test(entry.session_id)
  ) {
    return;
  }
  if (typeof entry.reason !== "string" || !isValidPromptLogReason(entry.reason)) {
    return;
  }
  if (
    typeof entry.duration_ms !== "number" ||
    !Number.isFinite(entry.duration_ms) ||
    entry.duration_ms < 0
  ) {
    return;
  }
  if (typeof entry.timestamp !== "string" || !isValidTimestamp(entry.timestamp)) {
    return;
  }
  const logPath = path.join(projectRoot, ".aic", "session-log.jsonl");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}

module.exports = { appendSessionLog };
