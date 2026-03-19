// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PostToolUse (Edit|Write) — records edited file path to session-keyed temp file for Stop hook.

const path = require("path");
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { writeEditedFiles } = require("../../shared/edited-files-cache.cjs");

function run(stdinStr) {
  try {
    const input =
      typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    const sessionId =
      input.session_id != null
        ? input.session_id
        : (input.input?.session_id ?? "default");
    const pathValue =
      input.tool_input?.path != null
        ? input.tool_input.path
        : (input.input?.tool_input?.path ?? "");
    if (typeof pathValue !== "string" || pathValue.trim() === "") {
      return "{}";
    }
    writeEditedFiles("claude_code", sessionId, [path.resolve(pathValue)]);
    return "{}";
  } catch {
    return "{}";
  }
}

if (require.main === module) {
  const raw = readStdinSync();
  process.stdout.write(run(raw));
  process.exit(0);
}

module.exports = { run };
