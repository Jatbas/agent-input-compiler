// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Keep in sync with shared/src/maintenance/select-session-model-from-jsonl.ts

const {
  isValidModelId,
  isValidConversationId,
  isValidEditorId,
} = require("./AIC-cache-field-validators.cjs");

function reduceSessionModelJsonlState(raw, conversationId, editorId) {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const cid = typeof conversationId === "string" ? conversationId.trim() : "";
  return lines.reduce(
    (s, line) => {
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
          return s;
        }
        return {
          last: entry.m,
          match: cid.length > 0 && entry.c === cid ? entry.m : s.match,
        };
      } catch {
        return s;
      }
    },
    { match: null, last: null },
  );
}

function selectSessionModelIdFromJsonlContent(raw, conversationId, editorId) {
  const state = reduceSessionModelJsonlState(raw, conversationId, editorId);
  return state.match ?? state.last;
}

module.exports = {
  reduceSessionModelJsonlState,
  selectSessionModelIdFromJsonlContent,
};
