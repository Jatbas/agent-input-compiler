// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Persists a tmpdir marker confirming a given editor/conversationId pair was seen.
// Used as a fallback by isCursorNativeHookPayload when cursor_version is absent
// mid-conversation (e.g. in tool-call payloads).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EDITOR_RUNTIME_MARKER_TTL_MS = 30 * 60 * 1000;

function markerPath(projectRoot, editorId, conversationId) {
  const hash = crypto
    .createHash("md5")
    .update(`${editorId}\u0000${projectRoot}\u0000${conversationId}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `aic-editor-rt-${hash}`);
}

function touchEditorRuntimeMarker(projectRoot, editorId, conversationId) {
  try {
    fs.writeFileSync(
      markerPath(projectRoot, editorId, conversationId),
      String(Date.now()),
    );
    return true;
  } catch {
    return false;
  }
}

function isEditorRuntimeMarkerFresh(projectRoot, editorId, conversationId, nowMs, ttlMs) {
  try {
    const ts = Number(
      fs.readFileSync(markerPath(projectRoot, editorId, conversationId), "utf8").trim(),
    );
    const now = typeof nowMs === "number" ? nowMs : Date.now();
    const ttl = typeof ttlMs === "number" ? ttlMs : EDITOR_RUNTIME_MARKER_TTL_MS;
    return Number.isFinite(ts) && now - ts <= ttl;
  } catch {
    return false;
  }
}

module.exports = {
  EDITOR_RUNTIME_MARKER_TTL_MS,
  touchEditorRuntimeMarker,
  isEditorRuntimeMarkerFresh,
};
