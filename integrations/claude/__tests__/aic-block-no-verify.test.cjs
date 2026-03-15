// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const { run } = require(path.join(__dirname, "..", "hooks", "aic-block-no-verify.cjs"));

function deny_git_no_verify() {
  const out = run(JSON.stringify({ tool_input: { command: "git commit --no-verify" } }));
  const output = JSON.parse(out);
  if (output.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(
      `Expected permissionDecision "deny", got ${output.hookSpecificOutput?.permissionDecision}`,
    );
  }
  const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
  if (reason.indexOf("pre-commit") === -1) {
    throw new Error(
      `Expected permissionDecisionReason to include "pre-commit", got ${reason}`,
    );
  }
  console.log("deny_git_no_verify: pass");
}

function deny_git_short_n() {
  const out = run(JSON.stringify({ tool_input: { command: "git commit -n" } }));
  const output = JSON.parse(out);
  if (output.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(
      `Expected permissionDecision "deny", got ${output.hookSpecificOutput?.permissionDecision}`,
    );
  }
  console.log("deny_git_short_n: pass");
}

function allow_git_without_flag() {
  const out = run(JSON.stringify({ tool_input: { command: "git commit -m 'fix'" } }));
  if (out !== "{}") {
    throw new Error(`Expected "{}", got ${JSON.stringify(out)}`);
  }
  console.log("allow_git_without_flag: pass");
}

function allow_non_git() {
  const out = run(JSON.stringify({ tool_input: { command: "npm run build" } }));
  if (out !== "{}") {
    throw new Error(`Expected "{}", got ${JSON.stringify(out)}`);
  }
  console.log("allow_non_git: pass");
}

function allow_quoted_no_verify_in_message() {
  const out = run(
    JSON.stringify({
      tool_input: { command: "git commit -m 'use --no-verify in docs'" },
    }),
  );
  if (out !== "{}") {
    throw new Error(`Expected "{}", got ${JSON.stringify(out)}`);
  }
  console.log("allow_quoted_no_verify_in_message: pass");
}

function allow_empty_or_malformed() {
  const out1 = run("{}");
  if (out1 !== "{}") {
    throw new Error(`Expected "{}" for {}, got ${JSON.stringify(out1)}`);
  }
  const out2 = run("not json");
  if (out2 !== "{}") {
    throw new Error(`Expected "{}" for malformed, got ${JSON.stringify(out2)}`);
  }
  console.log("allow_empty_or_malformed: pass");
}

deny_git_no_verify();
deny_git_short_n();
allow_git_without_flag();
allow_non_git();
allow_quoted_no_verify_in_message();
allow_empty_or_malformed();
console.log("All tests passed.");
