// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const { appendJsonl } = require("./aic-dir.cjs");
const {
  isValidConversationId,
  isValidEditorId,
  isValidGenerationId,
  isValidModelId,
  isValidPromptLogReason,
  isValidPromptLogTitle,
  isValidTimestamp,
} = require("./cache-field-validators.cjs");

function appendPromptLog(projectRoot, entry) {
  if (entry.type !== "prompt" && entry.type !== "session_end") return;
  if (
    !isValidEditorId(entry.editorId) ||
    !isValidConversationId(entry.conversationId) ||
    !isValidTimestamp(entry.timestamp)
  ) {
    return;
  }
  if (entry.type === "prompt") {
    if (
      typeof entry.generationId !== "string" ||
      !isValidGenerationId(entry.generationId) ||
      !isValidPromptLogTitle(entry.title) ||
      typeof entry.model !== "string"
    ) {
      return;
    }
    if (entry.model !== "" && !isValidModelId(entry.model)) return;
  } else {
    if (typeof entry.reason !== "string" || !isValidPromptLogReason(entry.reason)) {
      return;
    }
  }
  appendJsonl(projectRoot, "prompt-log.jsonl", entry);
}

module.exports = { appendPromptLog };
