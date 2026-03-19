// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const {
  isValidModelId,
  isValidConversationId,
  isValidEditorId,
} = require("./cache-field-validators.cjs");

function normalizeModelId(raw) {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

function readSessionModelCache(projectRoot, conversationId, editorId) {
  const filePath = path.join(projectRoot, ".aic", "session-models.jsonl");
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const cid = typeof conversationId === "string" ? conversationId.trim() : "";
  let lastMatch = null;
  let lastAny = null;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (
        typeof entry.m !== "string" ||
        !isValidModelId(entry.m) ||
        typeof entry.c !== "string" ||
        !isValidConversationId(entry.c) ||
        typeof entry.e !== "string" ||
        !isValidEditorId(entry.e) ||
        entry.e !== editorId
      ) {
        continue;
      }
      lastAny = entry.m;
      if (cid.length > 0 && entry.c === cid) lastMatch = entry.m;
    } catch {
      // skip malformed
    }
  }
  return lastMatch !== null ? lastMatch : lastAny;
}

function writeSessionModelCache(
  projectRoot,
  modelId,
  conversationId,
  editorId,
  timestamp,
) {
  const filePath = path.join(projectRoot, ".aic", "session-models.jsonl");
  const ts = timestamp !== undefined ? timestamp : new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const entry = JSON.stringify({
      c: typeof conversationId === "string" ? conversationId.trim() : "",
      m: modelId,
      e: editorId,
      timestamp: ts,
    });
    fs.appendFileSync(filePath, entry + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}

module.exports = {
  isValidModelId,
  normalizeModelId,
  readSessionModelCache,
  writeSessionModelCache,
};
