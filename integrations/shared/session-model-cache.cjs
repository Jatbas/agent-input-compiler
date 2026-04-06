// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const { appendJsonl } = require("./aic-dir.cjs");
const { isValidModelId } = require("./cache-field-validators.cjs");
const {
  readSessionModelIdFromSessionModelsJsonl,
} = require("./read-session-model-jsonl.cjs");

function normalizeModelId(raw) {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

function readSessionModelCache(projectRoot, conversationId, editorId) {
  return readSessionModelIdFromSessionModelsJsonl(projectRoot, conversationId, editorId);
}

function writeSessionModelCache(
  projectRoot,
  modelId,
  conversationId,
  editorId,
  timestamp,
) {
  const ts = timestamp !== undefined ? timestamp : new Date().toISOString();
  const entryObj = {
    c: typeof conversationId === "string" ? conversationId.trim() : "",
    m: modelId,
    e: editorId,
    timestamp: ts,
  };
  appendJsonl(projectRoot, "session-models.jsonl", entryObj);
}

module.exports = {
  isValidModelId,
  normalizeModelId,
  readSessionModelCache,
  writeSessionModelCache,
};
