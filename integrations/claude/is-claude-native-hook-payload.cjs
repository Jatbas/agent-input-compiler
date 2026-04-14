// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Positive gate: returns true when the hook payload was sent by native Claude Code.
//
// Detection strategy (evidence-based):
//   Primary  — transcript_path: Claude Code includes this in every hook event
//              (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop,
//              SubagentStart). Cursor and cursor-claude-code never set it.
//   Explicit — cursor_version field: presence means definitively not Claude Code.
//   Fallback — editor runtime marker for "claude-code" + conversationId: written
//              by a Claude hook once transcript_path has been confirmed. Inactive
//              until a Claude hook calls touchEditorRuntimeMarker("claude-code", …).
//
// cursor-claude-code (Cursor hosting Claude) has conversation_id but no
// transcript_path and no cursor_version — falls through primary check, returns
// false from fallback (no "claude-code" marker was written for that session).

const { conversationIdFromTranscriptPath } = require("../shared/conversation-id.cjs");
const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");
const { isEditorRuntimeMarkerFresh } = require("../shared/editor-runtime-marker.cjs");

function isClaudeNativeHookPayload(parsed) {
  if (parsed == null || typeof parsed !== "object") return false;

  // Cursor payloads carry cursor_version — definitively not Claude Code
  if ((parsed.cursor_version ?? parsed.input?.cursor_version) != null) return false;

  // Primary: transcript_path is exclusive to native Claude Code hook events
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path;
  if (typeof transcriptPath === "string" && transcriptPath.trim().length > 0) {
    return true;
  }

  // Fallback: fresh editor runtime marker written by a confirmed Claude Code hook
  const conversationId = conversationIdFromTranscriptPath(parsed);
  if (conversationId === null) return false;
  const projectRoot = resolveProjectRoot(parsed);
  return isEditorRuntimeMarkerFresh(projectRoot, "claude-code", conversationId);
}

module.exports = { isClaudeNativeHookPayload };
