// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Keep in sync with shared/src/maintenance/read-session-model-jsonl.ts

const fs = require("fs");
const path = require("path");
const {
  reduceSessionModelJsonlState,
  selectSessionModelIdFromJsonlContent,
} = require("./select-session-model-from-jsonl.cjs");

// 262144: 24h retention plus append-only growth keeps hot-path reads bounded
const SESSION_MODEL_JSONL_MAX_TAIL_BYTES = 262144;

function readSessionModelIdFromSessionModelsJsonl(projectRoot, conversationId, editorId) {
  const jsonlPath = path.join(projectRoot, ".aic", "session-models.jsonl");
  let fd;
  try {
    fd = fs.openSync(jsonlPath, "r");
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) {
      return null;
    }
    const start = Math.max(0, size - SESSION_MODEL_JSONL_MAX_TAIL_BYTES);
    const readLen = Math.min(SESSION_MODEL_JSONL_MAX_TAIL_BYTES, size - start);
    const buffer = Buffer.alloc(SESSION_MODEL_JSONL_MAX_TAIL_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, readLen, start);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const suffix =
      start > 0
        ? ((nl) => (nl === -1 ? "" : text.slice(nl + 1)))(text.indexOf("\n"))
        : text;
    const suffixState = reduceSessionModelJsonlState(suffix, conversationId, editorId);
    const cid = typeof conversationId === "string" ? conversationId.trim() : "";
    if (cid.length > 0 && suffixState.match === null) {
      return selectSessionModelIdFromJsonlContent(
        fs.readFileSync(jsonlPath, "utf8"),
        conversationId,
        editorId,
      );
    }
    if (cid.length === 0 && suffixState.last === null && size > 0) {
      return selectSessionModelIdFromJsonlContent(
        fs.readFileSync(jsonlPath, "utf8"),
        conversationId,
        editorId,
      );
    }
    return suffixState.match ?? suffixState.last;
  } catch {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore close errors
    }
  }
}

module.exports = { readSessionModelIdFromSessionModelsJsonl };
