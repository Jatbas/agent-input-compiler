// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SessionStart hook — hookSpecificOutput JSON per CC §6.2; writes dual-path marker for T02.

const fs = require("fs");
const path = require("path");
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
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
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
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const aicDir = path.join(projectRoot, ".aic");
  const markerPath = path.join(projectRoot, ".aic", ".session-context-injected");
  const lockPath = path.join(aicDir, ".session-start-lock");

  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });

  // Atomic lock — prevent concurrent SessionStart invocations
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, "wx");
    fs.closeSync(lockFd);
  } catch {
    // Lock exists — check if a prior run already succeeded
    const markerContent = fs.existsSync(markerPath)
      ? fs.readFileSync(markerPath, "utf8").trim()
      : "";
    if (markerContent.length > 0) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* stale lock cleanup */
      }
    }
    return null;
  }

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
    fs.writeFileSync(markerPath, sessionId ?? "", "utf8");
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: text,
      },
    };
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
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
