// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const { isValidConversationId } = require("./cache-field-validators.cjs");

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

function normalizedValidFallbackCandidate(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length === 0) return null;
  return isValidConversationId(t) ? t : null;
}

function resolveConversationIdFallback(parsed) {
  if (parsed == null) return null;
  const input = parsed.input;
  const orderedGroups = [
    [parsed.parent_conversation_id, input?.parent_conversation_id],
    [parsed.session_id, input?.session_id],
    [
      parsed.generation_id,
      input?.generation_id,
      parsed.generationId,
      input?.generationId,
    ],
  ];
  for (const group of orderedGroups) {
    for (const raw of group) {
      const v = normalizedValidFallbackCandidate(raw);
      if (v != null) return v;
    }
  }
  return null;
}

module.exports = {
  conversationIdFromTranscriptPath,
  conversationIdFromAgentTranscriptPath,
  explicitEditorIdFromClaudeHookEnvelope,
  resolveConversationIdFallback,
};
