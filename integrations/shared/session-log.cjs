// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const { appendJsonl } = require("./aic-dir.cjs");
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
  appendJsonl(projectRoot, "session-log.jsonl", entry);
}

module.exports = { appendSessionLog };
