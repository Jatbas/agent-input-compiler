// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SessionStart hook — hookSpecificOutput JSON per CC §6.2; writes dual-path marker for T02.

const fs = require("fs");
const path = require("path");
const {
  acquireSessionLock,
  releaseSessionLock,
  writeSessionMarker,
} = require("../../../shared/session-markers.cjs");
const { resolveProjectRoot } = require("../../../shared/resolve-project-root.cjs");
const {
  conversationIdFromTranscriptPath,
} = require("../../../shared/conversation-id.cjs");
const { callAicCompile } = require("./aic-compile-helper.cjs");

async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const sessionId =
    parsed.session_id != null ? parsed.session_id : (parsed.input?.session_id ?? null);
  const conversationId = conversationIdFromTranscriptPath(parsed);
  const rawModel =
    parsed.model != null
      ? parsed.model
      : parsed.input != null
        ? parsed.input.model
        : null;
  const modelArg =
    typeof rawModel === "string"
      ? (() => {
          const t = rawModel.trim();
          return t.length >= 1 && t.length <= 256 && /^[\x20-\x7E]+$/.test(t)
            ? t
            : undefined;
        })()
      : undefined;
  const projectRoot = resolveProjectRoot(parsed);

  if (!acquireSessionLock(projectRoot)) return null;

  try {
    const text = await callAicCompile(
      "understand project structure, architecture, and recent changes",
      projectRoot,
      conversationId,
      30000,
      "session_start",
      modelArg,
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
  const raw = fs.readFileSync(0, "utf8");
  run(raw)
    .then((out) => {
      if (out != null) process.stdout.write(JSON.stringify(out));
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

module.exports = { run };
