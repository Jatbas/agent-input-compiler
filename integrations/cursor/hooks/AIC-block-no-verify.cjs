// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// beforeShellExecution hook — blocks git commands that use --no-verify or -n (skip hooks).
// Prevents agents from bypassing pre-commit formatting and lint checks.
// Strip quoted strings so --no-verify inside a commit message is not treated as a flag.
const {
  isCursorNativeHookPayload,
} = require("../../shared/is-cursor-native-hook-payload.cjs");

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
    const cmdWithoutQuotes = stripQuoted(cmd);

    const isGitCmd = /\bgit\b/.test(cmd);
    const hasNoVerify =
      /--no-verify\b/.test(cmdWithoutQuotes) || /\s-n\b/.test(cmdWithoutQuotes);

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
