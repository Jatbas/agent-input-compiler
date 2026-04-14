// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");
const { isEditorRuntimeMarkerFresh } = require("../shared/editor-runtime-marker.cjs");

function pickConversationId(parsed) {
  const candidates = [
    parsed?.conversation_id,
    parsed?.conversationId,
    parsed?.input?.conversation_id,
    parsed?.input?.conversationId,
  ];
  const found = candidates.find((v) => typeof v === "string" && v.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function isCursorNativeHookPayload(parsed) {
  if (parsed == null || typeof parsed !== "object") return false;
  if ((parsed.cursor_version ?? parsed.input?.cursor_version) != null) return true;
  const conversationId = pickConversationId(parsed);
  if (conversationId === null) return false;
  const projectRoot = resolveProjectRoot(parsed);
  return isEditorRuntimeMarkerFresh(projectRoot, "cursor", conversationId);
}

module.exports = { isCursorNativeHookPayload };
