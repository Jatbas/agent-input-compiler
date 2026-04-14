// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// beforeShellExecution hook — blocks git commands that use --no-verify or -n (skip hooks).
// Prevents agents from bypassing pre-commit formatting and lint checks.
// Strip quoted strings so --no-verify inside a commit message is not treated as a flag.
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");

function stripQuoted(str) {
  return str.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (!isCursorNativeHookPayload(input)) {
      process.exit(0);
    }
    const cmd = (input.command || "").trim();
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
      process.stdout.write(
        JSON.stringify({
          permission: "deny",
          user_message: "Blocked: --no-verify is forbidden by project rules.",
          agent_message:
            "BLOCKED: --no-verify is forbidden. Project rules require all git commits to run through pre-commit hooks (Husky + lint-staged) which enforce formatting and linting. Remove --no-verify and commit normally.",
        }),
      );
      return;
    }

    process.stdout.write(JSON.stringify({ permission: "allow" }));
  } catch {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
  }
});
