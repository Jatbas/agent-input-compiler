// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const childProcess = require("child_process");
const path = require("path");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = require.resolve("./aic-subagent-stop.cjs", { paths: [hooksDir] });

function freshHook() {
  delete require.cache[hookPath];
  return require(hookPath);
}

function reparents_when_both_ids_present() {
  const originalExecSync = childProcess.execSync;
  let capturedCmd = null;
  let capturedInput = null;
  childProcess.execSync = (cmd, opts) => {
    capturedCmd = cmd;
    capturedInput = opts.input;
  };
  try {
    const { run } = freshHook();
    run(
      JSON.stringify({
        cwd: "/tmp/test-project",
        transcript_path: "/home/user/.claude/conversations/parent-abc.jsonl",
        agent_transcript_path: "/home/user/.claude/conversations/child-xyz.jsonl",
      }),
    );
    if (capturedCmd === null) throw new Error("Expected execSync to be called");
    const lines = capturedInput.split("\n").filter((l) => l.trim());
    const toolsCall = JSON.parse(lines[2]);
    const args = toolsCall.params.arguments;
    if (args.conversationId !== "parent-abc") {
      throw new Error(`Expected conversationId "parent-abc", got ${args.conversationId}`);
    }
    if (args.reparentFromConversationId !== "child-xyz") {
      throw new Error(
        `Expected reparentFromConversationId "child-xyz", got ${args.reparentFromConversationId}`,
      );
    }
    if (args.triggerSource !== "subagent_stop") {
      throw new Error(
        `Expected triggerSource "subagent_stop", got ${args.triggerSource}`,
      );
    }
    console.log("reparents_when_both_ids_present: pass");
  } finally {
    childProcess.execSync = originalExecSync;
  }
}

function reparent_uses_session_id_fallback_for_parent() {
  const originalExecSync = childProcess.execSync;
  let capturedInput = null;
  childProcess.execSync = (_cmd, opts) => {
    capturedInput = opts.input;
  };
  try {
    const { run } = freshHook();
    run(
      JSON.stringify({
        cwd: "/tmp/test-project",
        session_id: "parent-sess-fb",
        agent_transcript_path: "/home/user/.claude/conversations/child-xyz.jsonl",
      }),
    );
    if (capturedInput === null) throw new Error("Expected execSync to be called");
    const lines = capturedInput.split("\n").filter((l) => l.trim());
    const toolsCall = JSON.parse(lines[2]);
    const args = toolsCall.params.arguments;
    if (args.conversationId !== "parent-sess-fb") {
      throw new Error(
        `Expected conversationId from fallback, got ${args.conversationId}`,
      );
    }
    if (args.reparentFromConversationId !== "child-xyz") {
      throw new Error(
        `Expected reparentFromConversationId "child-xyz", got ${args.reparentFromConversationId}`,
      );
    }
    console.log("reparent_uses_session_id_fallback_for_parent: pass");
  } finally {
    childProcess.execSync = originalExecSync;
  }
}

function skips_reparent_when_no_transcript_path() {
  const originalExecSync = childProcess.execSync;
  let called = false;
  childProcess.execSync = () => {
    called = true;
  };
  try {
    const { run } = freshHook();
    run(
      JSON.stringify({
        cwd: "/tmp/test-project",
        agent_transcript_path: "/home/user/.claude/conversations/child-xyz.jsonl",
      }),
    );
    if (called)
      throw new Error("Expected execSync NOT to be called when transcript_path absent");
    console.log("skips_reparent_when_no_transcript_path: pass");
  } finally {
    childProcess.execSync = originalExecSync;
  }
}

function skips_reparent_when_ids_identical() {
  const originalExecSync = childProcess.execSync;
  let called = false;
  childProcess.execSync = () => {
    called = true;
  };
  try {
    const { run } = freshHook();
    run(
      JSON.stringify({
        cwd: "/tmp/test-project",
        transcript_path: "/home/user/.claude/conversations/same-id.jsonl",
        agent_transcript_path: "/home/user/.claude/conversations/same-id.jsonl",
      }),
    );
    if (called)
      throw new Error("Expected execSync NOT to be called when IDs are identical");
    console.log("skips_reparent_when_ids_identical: pass");
  } finally {
    childProcess.execSync = originalExecSync;
  }
}

function skips_reparent_when_no_agent_transcript_path() {
  const originalExecSync = childProcess.execSync;
  let called = false;
  childProcess.execSync = () => {
    called = true;
  };
  try {
    const { run } = freshHook();
    run(
      JSON.stringify({
        cwd: "/tmp/test-project",
        transcript_path: "/home/user/.claude/conversations/parent-abc.jsonl",
      }),
    );
    if (called)
      throw new Error(
        "Expected execSync NOT to be called when agent_transcript_path absent",
      );
    console.log("skips_reparent_when_no_agent_transcript_path: pass");
  } finally {
    childProcess.execSync = originalExecSync;
  }
}

function subagent_stop_noop_when_cursor_version_present() {
  const originalExecSync = childProcess.execSync;
  let called = false;
  childProcess.execSync = () => {
    called = true;
  };
  try {
    const { run } = freshHook();
    run(
      JSON.stringify({
        cwd: "/tmp/test-project",
        cursor_version: "3",
        transcript_path: "/home/user/.claude/conversations/parent-abc.jsonl",
        agent_transcript_path: "/home/user/.claude/conversations/child-xyz.jsonl",
      }),
    );
    if (called) {
      throw new Error("Expected execSync NOT to be called when cursor_version present");
    }
    console.log("subagent_stop_noop_when_cursor_version_present: pass");
  } finally {
    childProcess.execSync = originalExecSync;
  }
}

reparents_when_both_ids_present();
reparent_uses_session_id_fallback_for_parent();
skips_reparent_when_no_transcript_path();
skips_reparent_when_ids_identical();
skips_reparent_when_no_agent_transcript_path();
subagent_stop_noop_when_cursor_version_present();
