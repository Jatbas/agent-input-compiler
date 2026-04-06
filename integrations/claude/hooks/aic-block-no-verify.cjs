// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreToolUse (Bash) — blocks git commands with --no-verify or -n so agents cannot bypass pre-commit hooks.

const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");

function stripQuoted(str) {
  return str.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

function run(stdinStr) {
  try {
    const input =
      typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    const cmd = (
      input.tool_input?.command ??
      input?.input?.tool_input?.command ??
      ""
    ).trim();
    const cmdWithoutQuotes = stripQuoted(cmd);
    const isGitCmd = /\bgit\b/.test(cmd);
    const hasNoVerify =
      /--no-verify\b/.test(cmdWithoutQuotes) || /\s-n\b/.test(cmdWithoutQuotes);

    if (isGitCmd && hasNoVerify) {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            "AIC project rules require pre-commit hooks. Remove --no-verify and fix any lint/format issues.",
        },
      });
    }
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
