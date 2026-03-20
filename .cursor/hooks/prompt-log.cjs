// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
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
  const logPath = path.join(projectRoot, ".aic", "prompt-log.jsonl");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}

module.exports = { appendPromptLog };
