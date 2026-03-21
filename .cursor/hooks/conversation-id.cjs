// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");

function conversationIdFromTranscriptPath(parsed) {
  if (parsed == null) return null;
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const trimmed = typeof transcriptPath === "string" ? transcriptPath.trim() : "";
  return trimmed.length > 0 ? path.basename(trimmed, ".jsonl") : null;
}

module.exports = { conversationIdFromTranscriptPath };
