// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");

const hookPath = path.join(__dirname, "..", "hooks", "AIC-subagent-stop.cjs");

function runHook(stdinJson) {
  const originalExecSync = childProcess.execSync;
  let capturedCmd = null;
  let capturedInput = null;
  childProcess.execSync = (cmd, opts) => {
    capturedCmd = cmd;
    capturedInput = opts.input;
  };
  try {
    delete require.cache[hookPath];
    // Hook reads stdin via fs.readFileSync(0) — monkeypatch for testing
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = (fd, enc) => {
      if (fd === 0) return stdinJson;
      return originalReadFileSync.call(fs, fd, enc);
    };
    try {
      require(hookPath);
    } finally {
      fs.readFileSync = originalReadFileSync;
      delete require.cache[hookPath];
    }
  } finally {
    childProcess.execSync = originalExecSync;
  }
  return { capturedCmd, capturedInput };
}

function reparents_when_conversation_id_present() {
  const { capturedCmd, capturedInput } = runHook(
    JSON.stringify({
      cwd: "/tmp/test-project",
      conversation_id: "parent-abc",
      agent_transcript_path: "/home/user/.cursor/conversations/child-xyz.jsonl",
    }),
  );
  assert.notStrictEqual(capturedCmd, null, "Expected execSync to be called");
  const lines = capturedInput.split("\n").filter((l) => l.trim());
  const toolsCall = JSON.parse(lines[2]);
  const args = toolsCall.params.arguments;
  assert.strictEqual(args.conversationId, "parent-abc");
  assert.strictEqual(args.reparentFromConversationId, "child-xyz");
  assert.strictEqual(args.triggerSource, "subagent_stop");
  console.log("reparents_when_conversation_id_present: pass");
}

function reparents_using_parent_conversation_id_fallback() {
  const { capturedCmd, capturedInput } = runHook(
    JSON.stringify({
      cwd: "/tmp/test-project",
      parent_conversation_id: "parent-fallback",
      agent_transcript_path: "/home/user/.cursor/conversations/child-xyz.jsonl",
    }),
  );
  assert.notStrictEqual(
    capturedCmd,
    null,
    "Expected execSync to be called via fallback field",
  );
  const lines = capturedInput.split("\n").filter((l) => l.trim());
  const toolsCall = JSON.parse(lines[2]);
  const args = toolsCall.params.arguments;
  assert.strictEqual(args.conversationId, "parent-fallback");
  assert.strictEqual(args.reparentFromConversationId, "child-xyz");
  console.log("reparents_using_parent_conversation_id_fallback: pass");
}

function skips_when_both_id_fields_absent() {
  const { capturedCmd } = runHook(
    JSON.stringify({
      cwd: "/tmp/test-project",
      agent_transcript_path: "/home/user/.cursor/conversations/child-xyz.jsonl",
    }),
  );
  assert.strictEqual(
    capturedCmd,
    null,
    "Expected execSync NOT to be called when both ID fields absent",
  );
  console.log("skips_when_both_id_fields_absent: pass");
}

function skips_when_ids_identical() {
  const { capturedCmd } = runHook(
    JSON.stringify({
      cwd: "/tmp/test-project",
      conversation_id: "same-id",
      agent_transcript_path: "/home/user/.cursor/conversations/same-id.jsonl",
    }),
  );
  assert.strictEqual(
    capturedCmd,
    null,
    "Expected execSync NOT to be called when IDs are identical",
  );
  console.log("skips_when_ids_identical: pass");
}

function skips_when_no_agent_transcript_path() {
  const { capturedCmd } = runHook(
    JSON.stringify({
      cwd: "/tmp/test-project",
      conversation_id: "parent-abc",
    }),
  );
  assert.strictEqual(
    capturedCmd,
    null,
    "Expected execSync NOT to be called when agent_transcript_path absent",
  );
  console.log("skips_when_no_agent_transcript_path: pass");
}

reparents_when_conversation_id_present();
reparents_using_parent_conversation_id_fallback();
skips_when_both_id_fields_absent();
skips_when_ids_identical();
skips_when_no_agent_transcript_path();

console.log("All AIC-subagent-stop tests passed.");
