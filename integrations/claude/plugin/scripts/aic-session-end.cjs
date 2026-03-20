// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SessionEnd hook — append telemetry line, delete dual-path marker and temp edited-files list. Exit 0 always.

const fs = require("fs");

const {
  clearSessionMarker,
  releaseSessionLock,
} = require("../../../shared/session-markers.cjs");
const { appendPromptLog } = require("../../../shared/prompt-log.cjs");
const { cleanupEditedFiles } = require("../../../shared/edited-files-cache.cjs");

function run(stdinStr) {
  const parsed = (() => {
    try {
      return JSON.parse(stdinStr);
    } catch {
      return {};
    }
  })();
  const sessionId =
    parsed.session_id != null ? parsed.session_id : (parsed.input?.session_id ?? "");
  const reason = parsed.reason != null ? parsed.reason : (parsed.input?.reason ?? "");
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();

  appendPromptLog(projectRoot, {
    type: "session_end",
    editorId: "claude-code",
    conversationId: sessionId,
    reason,
    timestamp: new Date().toISOString(),
  });

  clearSessionMarker(projectRoot);
  releaseSessionLock(projectRoot);

  cleanupEditedFiles("claude_code", sessionId);
}

if (require.main === module) {
  const raw = (() => {
    try {
      return fs.readFileSync(0, "utf8");
    } catch {
      return "{}";
    }
  })();
  run(raw);
  process.exit(0);
}

module.exports = { run };
