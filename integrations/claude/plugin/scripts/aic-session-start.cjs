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
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const aicDir = path.join(projectRoot, ".aic");
  const markerPath = path.join(projectRoot, ".aic", ".session-context-injected");

  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });

  try {
    const text = await callAicCompile(
      "understand project structure, architecture, and recent changes",
      projectRoot,
      sessionId,
      30000,
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
