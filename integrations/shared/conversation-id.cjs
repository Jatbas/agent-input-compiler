// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");

function conversationIdFromTranscriptPath(parsed) {
  if (parsed == null) return null;
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const transcriptTrim = typeof transcriptPath === "string" ? transcriptPath.trim() : "";
  if (transcriptTrim.length > 0) {
    return path.basename(transcriptTrim, ".jsonl");
  }
  const directId = parsed.conversation_id ?? parsed.input?.conversation_id ?? null;
  const idTrim = typeof directId === "string" ? directId.trim() : "";
  return idTrim.length > 0 ? idTrim : null;
}

function explicitEditorIdFromClaudeHookEnvelope(parsed) {
  if (parsed == null) return "claude-code";
  const tp = parsed.transcript_path ?? parsed.input?.transcript_path;
  const transcriptTrim = typeof tp === "string" ? tp.trim() : "";
  const hasTranscript = transcriptTrim.length > 0;
  const cid = parsed.conversation_id ?? parsed.input?.conversation_id;
  const convTrim = typeof cid === "string" ? cid.trim() : "";
  if (convTrim.length > 0 && !hasTranscript) {
    return "cursor-claude-code";
  }
  return "claude-code";
}

function conversationIdFromAgentTranscriptPath(agentTranscriptPath) {
  if (agentTranscriptPath == null) return null;
  const trimmed =
    typeof agentTranscriptPath === "string" ? agentTranscriptPath.trim() : "";
  return trimmed.length > 0 ? path.basename(trimmed, ".jsonl") : null;
}

module.exports = {
  conversationIdFromTranscriptPath,
  conversationIdFromAgentTranscriptPath,
  explicitEditorIdFromClaudeHookEnvelope,
};
