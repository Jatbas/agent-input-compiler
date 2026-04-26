// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const hookPath = path.join(
  repoRoot,
  "integrations",
  "cursor",
  "hooks",
  "AIC-block-no-verify.cjs",
);

const HANDLER_DENY_MSG =
  "BLOCKED[block_no_verify_handler_error]: AIC beforeShellExecution hook failed. Retry the shell command.";

function block_malformed_json_returns_allow_only() {
  const result = spawnSync("node", [hookPath], {
    input: "{",
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`Expected status 0, got ${result.status}`);
  }
  if (result.stdout.trim() !== JSON.stringify({ permission: "allow" })) {
    throw new Error(
      `Expected allow-only stdout, got ${JSON.stringify(result.stdout.trim())}`,
    );
  }
  console.log("block_malformed_json_returns_allow_only: pass");
}

function block_integration_env_throw_returns_deny() {
  const stdin = JSON.stringify({ cursor_version: "1", command: "git status" });
  const result = spawnSync("node", [hookPath], {
    input: stdin,
    encoding: "utf8",
    env: {
      ...process.env,
      AIC_INTEGRATION_TEST_BLOCK_NO_VERIFY_INTERNAL_THROW: "1",
    },
  });
  const out = JSON.parse(result.stdout.trim());
  if (out.permission !== "deny") {
    throw new Error(`Expected permission deny, got ${JSON.stringify(out.permission)}`);
  }
  if (out.user_message !== HANDLER_DENY_MSG || out.agent_message !== HANDLER_DENY_MSG) {
    throw new Error(`Expected paired handler deny messages, got ${JSON.stringify(out)}`);
  }
  console.log("block_integration_env_throw_returns_deny: pass");
}

function block_integration_env_unset_still_allows_safe_git() {
  const stdin = JSON.stringify({ cursor_version: "1", command: "git status" });
  const env = { ...process.env };
  delete env.AIC_INTEGRATION_TEST_BLOCK_NO_VERIFY_INTERNAL_THROW;
  const result = spawnSync("node", [hookPath], {
    input: stdin,
    encoding: "utf8",
    env,
  });
  const out = JSON.parse(result.stdout.trim());
  if (out.permission !== "allow") {
    throw new Error(`Expected permission allow, got ${JSON.stringify(out.permission)}`);
  }
  console.log("block_integration_env_unset_still_allows_safe_git: pass");
}

function block_deny_git_no_verify_unchanged() {
  const stdin = JSON.stringify({
    cursor_version: "1",
    command: "git commit --no-verify -m x",
  });
  const result = spawnSync("node", [hookPath], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env },
  });
  const out = JSON.parse(result.stdout.trim());
  if (out.permission !== "deny") {
    throw new Error(`Expected permission deny, got ${JSON.stringify(out.permission)}`);
  }
  if (typeof out.user_message !== "string" || !out.user_message.includes("Blocked")) {
    throw new Error(
      `Expected user_message to include Blocked, got ${JSON.stringify(out.user_message)}`,
    );
  }
  console.log("block_deny_git_no_verify_unchanged: pass");
}

block_malformed_json_returns_allow_only();
block_integration_env_throw_returns_deny();
block_integration_env_unset_still_allows_safe_git();
block_deny_git_no_verify_unchanged();
console.log("All tests passed.");
