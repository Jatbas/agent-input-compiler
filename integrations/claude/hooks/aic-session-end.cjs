// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SessionEnd hook — append telemetry line, delete dual-path marker and temp edited-files list. Exit 0 always.

const fs = require("fs");
const path = require("path");
const os = require("os");

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

  const aicDir = path.join(projectRoot, ".aic");
  const logPath = path.join(aicDir, "prompt-log.jsonl");
  const markerPath = path.join(projectRoot, ".aic", ".session-context-injected");
  const sanitized = String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_");
  const tempPath = path.join(os.tmpdir(), "aic-cc-edited-" + sanitized + ".json");

  try {
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const line =
      JSON.stringify({
        sessionId,
        reason,
        timestamp: new Date().toISOString(),
      }) + "\n";
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // ignore; telemetry must not block
  }

  try {
    fs.unlinkSync(markerPath);
  } catch {
    // ignore ENOENT and other errors
  }

  try {
    fs.unlinkSync(tempPath);
  } catch {
    // ignore
  }
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
