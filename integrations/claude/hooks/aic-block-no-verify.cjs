// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreToolUse (Bash) — blocks git commands with --no-verify or -n so agents cannot bypass pre-commit hooks.

const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../shared/is-cursor-native-hook-payload.cjs");

function stripQuoted(str) {
  return str.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

function run(stdinStr) {
  try {
    const input =
      typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    const isCursorNative = isCursorNativeHookPayload(input);
    if (isCursorNative) return "{}";
    const cmd = (
      input.tool_input?.command ??
      input?.input?.tool_input?.command ??
      ""
    ).trim();
    // Extract only the git segment (before pipes/semicolons) to avoid false positives
    // from piped commands like `git show ... | grep -n ...`
    const gitSegment = cmd.split(/[|;&]/).find((seg) => /\bgit\b/.test(seg)) ?? "";
    const gitSegmentStripped = stripQuoted(gitSegment);
    const isGitCmd = gitSegment.trim().length > 0;
    const hasNoVerify =
      /--no-verify\b/.test(gitSegmentStripped) ||
      // -n is short for --no-verify only in git commit, not other subcommands
      /\bgit\s+commit\b.*\s-n\b/.test(gitSegmentStripped);

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
