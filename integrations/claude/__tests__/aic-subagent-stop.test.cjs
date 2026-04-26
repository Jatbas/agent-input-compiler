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
  const originalExecFileSync = childProcess.execFileSync;
  let capturedFile = null;
  let capturedArgs = null;
  let capturedInput = null;
  childProcess.execFileSync = (file, args, opts) => {
    capturedFile = file;
    capturedArgs = args;
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
    if (capturedFile === null) throw new Error("Expected execFileSync to be called");
    if (capturedFile !== "npx") {
      throw new Error(`Expected file "npx", got ${capturedFile}`);
    }
    if (capturedArgs[0] === "tsx") {
      if (typeof capturedArgs[1] !== "string" || !capturedArgs[1].includes("server.ts")) {
        throw new Error("Expected dev argv tsx then server script path");
      }
    } else if (capturedArgs[0] !== "-y" || capturedArgs[1] !== "@jatbas/aic") {
      throw new Error(
        `Expected prod argv [-y,@jatbas/aic] or dev [tsx,script], got ${JSON.stringify(capturedArgs)}`,
      );
    }
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
    childProcess.execFileSync = originalExecFileSync;
  }
}

function reparent_uses_session_id_fallback_for_parent() {
  const originalExecFileSync = childProcess.execFileSync;
  let capturedInput = null;
  childProcess.execFileSync = (_file, _args, opts) => {
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
    if (capturedInput === null) throw new Error("Expected execFileSync to be called");
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
    childProcess.execFileSync = originalExecFileSync;
  }
}

function skips_reparent_when_no_transcript_path() {
  const originalExecFileSync = childProcess.execFileSync;
  let called = false;
  childProcess.execFileSync = () => {
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
      throw new Error(
        "Expected execFileSync NOT to be called when transcript_path absent",
      );
    console.log("skips_reparent_when_no_transcript_path: pass");
  } finally {
    childProcess.execFileSync = originalExecFileSync;
  }
}

function skips_reparent_when_ids_identical() {
  const originalExecFileSync = childProcess.execFileSync;
  let called = false;
  childProcess.execFileSync = () => {
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
      throw new Error("Expected execFileSync NOT to be called when IDs are identical");
    console.log("skips_reparent_when_ids_identical: pass");
  } finally {
    childProcess.execFileSync = originalExecFileSync;
  }
}

function skips_reparent_when_no_agent_transcript_path() {
  const originalExecFileSync = childProcess.execFileSync;
  let called = false;
  childProcess.execFileSync = () => {
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
        "Expected execFileSync NOT to be called when agent_transcript_path absent",
      );
    console.log("skips_reparent_when_no_agent_transcript_path: pass");
  } finally {
    childProcess.execFileSync = originalExecFileSync;
  }
}

function subagent_stop_noop_when_cursor_version_present() {
  const originalExecFileSync = childProcess.execFileSync;
  let called = false;
  childProcess.execFileSync = () => {
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
      throw new Error(
        "Expected execFileSync NOT to be called when cursor_version present",
      );
    }
    console.log("subagent_stop_noop_when_cursor_version_present: pass");
  } finally {
    childProcess.execFileSync = originalExecFileSync;
  }
}

reparents_when_both_ids_present();
reparent_uses_session_id_fallback_for_parent();
skips_reparent_when_no_transcript_path();
skips_reparent_when_ids_identical();
skips_reparent_when_no_agent_transcript_path();
subagent_stop_noop_when_cursor_version_present();
