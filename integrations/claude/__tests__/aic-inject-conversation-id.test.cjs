// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const os = require("os");
const path = require("path");
const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-inject-conversation-id.cjs");

function cc_inject_replaces_weak_intent_with_prewarm_prompt() {
  const transcriptPath = path.join(os.tmpdir(), "aic-cc-prewarm-test.jsonl");
  const conversationId = conversationIdFromTranscriptPath({
    transcript_path: transcriptPath,
  });
  const prewarmPath = path.join(os.tmpdir(), `aic-prompt-cc-${conversationId}`);
  fs.writeFileSync(prewarmPath, "refactor auth module for oauth", "utf8");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const out = run(
    JSON.stringify({
      transcript_path: transcriptPath,
      tool_name: "aic_compile",
      tool_input: { intent: "general context compilation", projectRoot: "/tmp/x" },
    }),
  );
  try {
    fs.unlinkSync(prewarmPath);
  } catch {
    /* ignore */
  }
  const intent = out?.hookSpecificOutput?.updatedInput?.intent;
  if (intent !== "refactor auth module for oauth") {
    throw new Error(`Expected prewarm intent, got ${JSON.stringify(intent)}`);
  }
  console.log("cc_inject_replaces_weak_intent_with_prewarm_prompt: pass");
}

function cc_inject_applies_fallback_conversation_id_for_prewarm() {
  const prewarmPath = path.join(os.tmpdir(), "aic-prompt-cc-sess-inject-fb");
  fs.writeFileSync(prewarmPath, "intent from session fallback prewarm", "utf8");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const out = run(
    JSON.stringify({
      session_id: "sess-inject-fb",
      tool_name: "aic_compile",
      tool_input: { intent: "general context compilation", projectRoot: "/tmp/x" },
    }),
  );
  try {
    fs.unlinkSync(prewarmPath);
  } catch {
    /* ignore */
  }
  const uid = out?.hookSpecificOutput?.updatedInput;
  if (uid?.conversationId !== "sess-inject-fb") {
    throw new Error(`Expected conversationId fallback, got ${JSON.stringify(uid)}`);
  }
  if (uid?.intent !== "intent from session fallback prewarm") {
    throw new Error(`Expected prewarm intent, got ${JSON.stringify(uid?.intent)}`);
  }
  console.log("cc_inject_applies_fallback_conversation_id_for_prewarm: pass");
}

function cc_inject_skips_when_prewarm_missing() {
  const transcriptPath = path.join(os.tmpdir(), "aic-cc-no-prewarm-unique.jsonl");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const out = run(
    JSON.stringify({
      transcript_path: transcriptPath,
      tool_name: "aic_compile",
      tool_input: { intent: "general context compilation", projectRoot: "/tmp/x" },
    }),
  );
  const intent = out?.hookSpecificOutput?.updatedInput?.intent;
  if (intent !== "general context compilation") {
    throw new Error(`Expected default intent, got ${JSON.stringify(intent)}`);
  }
  console.log("cc_inject_skips_when_prewarm_missing: pass");
}

function cc_inject_routes_mcp_aic_tools_to_aic_dev_in_dev_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-inject-devmode-"));
  try {
    fs.writeFileSync(
      path.join(tempRoot, "aic.config.json"),
      JSON.stringify({ devMode: true }),
      "utf8",
    );
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const out = run(
      JSON.stringify({
        tool_name: "mcp",
        tool_input: {
          server: "aic",
          toolName: "aic_compile",
          arguments: { intent: "x", projectRoot: tempRoot },
        },
      }),
    );
    const server = out?.hookSpecificOutput?.updatedInput?.server;
    if (server !== "aic-dev") {
      throw new Error(`Expected aic-dev server, got ${JSON.stringify(server)}`);
    }
    console.log("cc_inject_routes_mcp_aic_tools_to_aic_dev_in_dev_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function cc_inject_routes_mcp_aic_tools_to_aic_outside_dev_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-inject-prodmode-"));
  try {
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const out = run(
      JSON.stringify({
        tool_name: "mcp",
        tool_input: {
          server: "aic-dev",
          toolName: "aic_status",
          arguments: { projectRoot: tempRoot },
        },
      }),
    );
    const server = out?.hookSpecificOutput?.updatedInput?.server;
    if (server !== "aic") {
      throw new Error(`Expected aic server, got ${JSON.stringify(server)}`);
    }
    console.log("cc_inject_routes_mcp_aic_tools_to_aic_outside_dev_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function cc_inject_routes_call_mcp_tool_to_aic_dev_in_dev_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-callmcp-devmode-"));
  try {
    fs.writeFileSync(
      path.join(tempRoot, "aic.config.json"),
      JSON.stringify({ devMode: true }),
      "utf8",
    );
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const out = run(
      JSON.stringify({
        tool_name: "call_mcp_tool",
        tool_input: {
          server: "aic",
          toolName: "aic_compile",
          arguments: { intent: "x", projectRoot: tempRoot },
        },
      }),
    );
    const server = out?.hookSpecificOutput?.updatedInput?.server;
    if (server !== "aic-dev") {
      throw new Error(`Expected aic-dev server, got ${JSON.stringify(server)}`);
    }
    console.log("cc_inject_routes_call_mcp_tool_to_aic_dev_in_dev_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

cc_inject_replaces_weak_intent_with_prewarm_prompt();
cc_inject_applies_fallback_conversation_id_for_prewarm();
cc_inject_skips_when_prewarm_missing();
cc_inject_routes_mcp_aic_tools_to_aic_dev_in_dev_mode();
cc_inject_routes_mcp_aic_tools_to_aic_outside_dev_mode();
cc_inject_routes_call_mcp_tool_to_aic_dev_in_dev_mode();
console.log("All tests passed.");
