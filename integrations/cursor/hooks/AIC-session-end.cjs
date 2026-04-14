// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// sessionEnd hook — cleanup AIC temp files and optionally append session metrics.
// Fire-and-forget: no stdout; must exit 0 always. Cursor docs: sessionEnd input only.
const fs = require("fs");
const path = require("path");
const os = require("os");

const { appendSessionLog } = require("../../shared/session-log.cjs");
const { cleanupEditedFiles } = require("../../shared/edited-files-cache.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");

const GATE_PREFIX = "aic-gate-";
const DENY_PREFIX = "aic-deny-";
const PROMPT_PREFIX = "aic-prompt-";

function cleanupTempFiles() {
  const tmpDir = os.tmpdir();
  let names = [];
  try {
    names = fs.readdirSync(tmpDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (
      !name.startsWith(GATE_PREFIX) &&
      !name.startsWith(DENY_PREFIX) &&
      !name.startsWith(PROMPT_PREFIX)
    )
      continue;
    try {
      fs.unlinkSync(path.join(tmpDir, name));
    } catch {
      // ignore per-file errors
    }
  }
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    process.exit(0);
    return;
  }
  let input = {};
  let sessionId = "";
  let reason = "";
  let durationMs = 0;
  let parseOk = false;
  try {
    input = JSON.parse(raw);
    parseOk = true;
    sessionId = input.session_id ?? "";
    reason = input.reason ?? "";
    durationMs = input.duration_ms ?? 0;
  } catch {
    // invalid JSON — still cleanup and exit 0
  }
  if (parseOk && !isCursorNativeHookPayload(input)) {
    process.exit(0);
  }
  const key =
    input.conversation_id ??
    input.conversationId ??
    input.session_id ??
    input.sessionId ??
    process.env.AIC_CONVERSATION_ID ??
    "default";

  cleanupTempFiles();
  cleanupEditedFiles("cursor", key);

  const projectRoot = resolveProjectRoot(null, { env: process.env });
  appendSessionLog(projectRoot, {
    session_id: sessionId,
    reason,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  });

  process.exit(0);
}

main();
