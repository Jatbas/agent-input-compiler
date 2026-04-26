// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SessionStart hook — hookSpecificOutput JSON per CC §6.2; writes dual-path marker for T02.

const fs = require("fs");
const path = require("path");
const {
  acquireSessionLock,
  releaseSessionLock,
  writeSessionMarker,
} = require("../../shared/session-markers.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../cursor/is-cursor-native-hook-payload.cjs");
const {
  conversationIdFromTranscriptPath,
  explicitEditorIdFromClaudeHookEnvelope,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const {
  readModelFromTranscript,
} = require("../../shared/read-model-from-transcript.cjs");
const { callAicCompile } = require("./aic-compile-helper.cjs");
const { touchEditorRuntimeMarker } = require("../../shared/editor-runtime-marker.cjs");
const {
  readLastConversationId,
  writeLastConversationId,
} = require("../../shared/compile-recency.cjs");

async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const isCursorNative = isCursorNativeHookPayload(parsed);
  if (isCursorNative) return null;
  const sessionId =
    parsed.session_id != null ? parsed.session_id : (parsed.input?.session_id ?? null);
  const projectRoot = resolveProjectRoot(parsed);
  // Fall back to the last known conversation id for this project when Claude Code
  // ships a partial SessionStart envelope (empty stdin race, or /compact variants
  // missing transcript_path/session_id). Prevents orphan compilation_log rows.
  const conversationId =
    conversationIdFromTranscriptPath(parsed) ??
    resolveConversationIdFallback(parsed) ??
    readLastConversationId(projectRoot);
  if (conversationId != null && String(conversationId).trim() !== "") {
    const trimmedId = String(conversationId).trim();
    writeLastConversationId(projectRoot, trimmedId);
    touchEditorRuntimeMarker(projectRoot, "claude-code", trimmedId);
  }

  const rawModel = parsed.model ?? parsed.input?.model ?? null;
  // Claude Code hook envelope omits model; ANTHROPIC_MODEL env var reflects the active model for this turn.
  // Transcript tail-read lags one turn behind — only use as last resort.
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const effectiveRawModel =
    rawModel ?? process.env["ANTHROPIC_MODEL"] ?? readModelFromTranscript(transcriptPath);
  const modelArg =
    typeof effectiveRawModel === "string" &&
    effectiveRawModel.trim().length >= 1 &&
    effectiveRawModel.trim().length <= 256 &&
    /^[\x20-\x7E]+$/.test(effectiveRawModel.trim())
      ? effectiveRawModel.trim()
      : undefined;

  if (!acquireSessionLock(projectRoot)) return null;

  try {
    const editorId = explicitEditorIdFromClaudeHookEnvelope(parsed);
    const text = await callAicCompile(
      "understand project structure, architecture, and recent changes",
      projectRoot,
      conversationId,
      30000,
      "session_start",
      modelArg,
      editorId,
    );
    if (text == null) return null;
    writeSessionMarker(projectRoot, sessionId);
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: text,
      },
    };
  } catch {
    return null;
  } finally {
    releaseSessionLock(projectRoot);
  }
}

if (require.main === module) {
  // Guard against Claude Code closing stdin before flushing (rare race that
  // otherwise produces compilation_log rows with NULL conversation_id).
  const raw = (() => {
    try {
      return fs.readFileSync(0, "utf8");
    } catch {
      return "{}";
    }
  })();
  run(raw)
    .then((out) => {
      if (out != null) process.stdout.write(JSON.stringify(out));
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = { run };
