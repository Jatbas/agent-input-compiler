// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// sessionEnd hook — cleanup AIC temp files and optionally append session metrics.
// Fire-and-forget: no stdout; must exit 0 always. Cursor docs: sessionEnd input only.
const fs = require("fs");
const path = require("path");
const os = require("os");

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

function appendSessionLog(projectRoot, sessionId, reason, durationMs) {
  const aicDir = path.join(projectRoot, ".aic");
  try {
    if (!fs.existsSync(aicDir) || !fs.statSync(aicDir).isDirectory()) return;
    const logPath = path.join(aicDir, "session-log.jsonl");
    const timestamp = new Date(Date.now()).toISOString();
    const line =
      JSON.stringify({
        session_id: sessionId,
        reason,
        duration_ms: durationMs,
        timestamp,
      }) + "\n";
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // ignore; optional log
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
  let sessionId = "";
  let reason = "";
  let durationMs = 0;
  try {
    const input = JSON.parse(raw);
    sessionId = input.session_id ?? "";
    reason = input.reason ?? "";
    durationMs = input.duration_ms ?? 0;
  } catch {
    // invalid JSON — still cleanup and exit 0
  }

  cleanupTempFiles();

  const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();
  appendSessionLog(projectRoot, sessionId, reason, durationMs);

  process.exit(0);
}

main();
