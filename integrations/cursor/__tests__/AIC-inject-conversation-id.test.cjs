// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const hookPath = path.join(
  repoRoot,
  "integrations",
  "cursor",
  "hooks",
  "AIC-inject-conversation-id.cjs",
);

function runHook(stdinStr, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  const result = spawnSync("node", [hookPath], {
    input: stdinStr,
    encoding: "utf8",
    env,
  });
  return result.stdout.trim();
}

function hookPayload(obj) {
  return JSON.stringify({ cursor_version: "1", ...obj });
}

function inject_modelId_when_model_present() {
  const stdin = hookPayload({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    conversation_id: "conv-abc",
    model: "claude-sonnet-4",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (out.permission !== "allow") {
    throw new Error(`Expected permission "allow", got ${out.permission}`);
  }
  if (!out.updated_input || out.updated_input.modelId !== "claude-sonnet-4") {
    throw new Error(
      `Expected updated_input.modelId "claude-sonnet-4", got ${JSON.stringify(out.updated_input?.modelId)}`,
    );
  }
  console.log("inject_modelId_when_model_present: pass");
}

function inject_uses_session_id_fallback_for_conversation_id() {
  const stdin = hookPayload({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    session_id: "sess-fallback-1",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (!out.updated_input || out.updated_input.conversationId !== "sess-fallback-1") {
    throw new Error(
      `Expected fallback conversationId sess-fallback-1, got ${JSON.stringify(out.updated_input)}`,
    );
  }
  console.log("inject_uses_session_id_fallback_for_conversation_id: pass");
}

function inject_allow_when_no_conversation_but_model() {
  const stdin = hookPayload({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    model: "cursor-model-1",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (out.permission !== "allow") {
    throw new Error(`Expected permission "allow", got ${out.permission}`);
  }
  if (!out.updated_input) {
    throw new Error("Expected updated_input when model is present");
  }
  if (out.updated_input.modelId !== "cursor-model-1") {
    throw new Error(
      `Expected updated_input.modelId "cursor-model-1", got ${JSON.stringify(out.updated_input.modelId)}`,
    );
  }
  if (out.updated_input.editorId !== "cursor") {
    throw new Error(
      `Expected updated_input.editorId "cursor", got ${JSON.stringify(out.updated_input.editorId)}`,
    );
  }
  console.log("inject_allow_when_no_conversation_but_model: pass");
}

function inject_replaces_weak_intent_with_prewarm_prompt() {
  const prewarmPath = path.join(os.tmpdir(), "aic-prompt-gen-inject-test");
  fs.writeFileSync(prewarmPath, "fix auth module for oauth", "utf8");
  try {
    const stdin = hookPayload({
      generation_id: "gen-inject-test",
      tool_name: "aic_compile",
      tool_input: {
        intent: "general context compilation",
        projectRoot: "/tmp/x",
      },
    });
    const stdout = runHook(stdin);
    const out = JSON.parse(stdout);
    if (out.updated_input?.intent !== "fix auth module for oauth") {
      throw new Error(
        `Expected updated intent from prewarm, got ${JSON.stringify(out.updated_input?.intent)}`,
      );
    }
    console.log("inject_replaces_weak_intent_with_prewarm_prompt: pass");
  } finally {
    try {
      fs.unlinkSync(prewarmPath);
    } catch {
      /* ignore */
    }
  }
}

function inject_strips_ide_selection_from_prewarm() {
  const prewarmPath = path.join(os.tmpdir(), "aic-prompt-gen-ide-strip");
  fs.writeFileSync(
    prewarmPath,
    "<ide_selection>noise</ide_selection>visible intent text",
    "utf8",
  );
  try {
    const stdin = hookPayload({
      generation_id: "gen-ide-strip",
      tool_name: "aic_compile",
      tool_input: {
        intent: "general context compilation",
        projectRoot: "/tmp/x",
      },
    });
    const stdout = runHook(stdin);
    const out = JSON.parse(stdout);
    if (out.updated_input?.intent !== "visible intent text") {
      throw new Error(
        `Expected stripped prewarm intent, got ${JSON.stringify(out.updated_input?.intent)}`,
      );
    }
    console.log("inject_strips_ide_selection_from_prewarm: pass");
  } finally {
    try {
      fs.unlinkSync(prewarmPath);
    } catch {
      /* ignore */
    }
  }
}

function inject_skips_when_prewarm_missing() {
  const stdin = hookPayload({
    conversation_id: "conv-skip-prewarm",
    generation_id: "gen-no-file-xyz",
    tool_name: "aic_compile",
    tool_input: {
      intent: "general context compilation",
      projectRoot: "/tmp/x",
    },
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (!out.updated_input) {
    throw new Error("Expected updated_input when conversation_id is injected");
  }
  if (out.updated_input.conversationId !== "conv-skip-prewarm") {
    throw new Error(
      `Expected conversationId conv-skip-prewarm, got ${JSON.stringify(out.updated_input.conversationId)}`,
    );
  }
  if (out.updated_input.intent !== "general context compilation") {
    throw new Error(
      `Expected default intent unchanged, got ${JSON.stringify(out.updated_input.intent)}`,
    );
  }
  console.log("inject_skips_when_prewarm_missing: pass");
}

function inject_normalizes_default_to_auto() {
  const stdin = hookPayload({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    conversation_id: "conv-abc",
    model: "default",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (out.permission !== "allow") {
    throw new Error(`Expected permission "allow", got ${out.permission}`);
  }
  if (!out.updated_input || out.updated_input.modelId !== "auto") {
    throw new Error(
      `Expected updated_input.modelId "auto", got ${JSON.stringify(out.updated_input?.modelId)}`,
    );
  }
  console.log("inject_normalizes_default_to_auto: pass");
}

function mcp_envelope_routes_aic_tools_to_aic_dev_in_dev_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-devmode-"));
  try {
    fs.writeFileSync(
      path.join(tempRoot, "aic.config.json"),
      JSON.stringify({ devMode: true }),
      "utf8",
    );
    const stdin = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "aic",
        toolName: "aic_compile",
        arguments: {
          intent: "test intent",
          projectRoot: tempRoot,
        },
      },
    });
    const stdout = runHook(stdin, { CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected permission "allow", got ${out.permission}`);
    }
    if (out.updated_input?.server !== "aic-dev") {
      throw new Error(
        `Expected updated_input.server "aic-dev", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("mcp_envelope_routes_aic_tools_to_aic_dev_in_dev_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function mcp_envelope_routes_aic_tools_to_aic_outside_dev_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-prodmode-"));
  try {
    const stdin = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "aic-dev",
        toolName: "aic_status",
        arguments: {
          projectRoot: tempRoot,
        },
      },
    });
    const stdout = runHook(stdin, { CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected permission "allow", got ${out.permission}`);
    }
    if (out.updated_input?.server !== "aic") {
      throw new Error(
        `Expected updated_input.server "aic", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("mcp_envelope_routes_aic_tools_to_aic_outside_dev_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

inject_modelId_when_model_present();
inject_uses_session_id_fallback_for_conversation_id();
inject_allow_when_no_conversation_but_model();
inject_replaces_weak_intent_with_prewarm_prompt();
inject_strips_ide_selection_from_prewarm();
inject_skips_when_prewarm_missing();
inject_normalizes_default_to_auto();
mcp_envelope_routes_aic_tools_to_aic_dev_in_dev_mode();
mcp_envelope_routes_aic_tools_to_aic_outside_dev_mode();

function cursor_inject_conversation_id_noop_when_no_cursor_version() {
  const result = spawnSync("node", [hookPath], {
    input: JSON.stringify({
      tool_name: "aic_compile",
      tool_input: { intent: "x", projectRoot: "/tmp" },
    }),
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.stdout.trim() !== "") {
    throw new Error(`Expected empty stdout, got ${JSON.stringify(result.stdout)}`);
  }
  if (result.status !== 0) {
    throw new Error(`Expected exit 0, got ${result.status}`);
  }
  console.log("cursor_inject_conversation_id_noop_when_no_cursor_version: pass");
}

cursor_inject_conversation_id_noop_when_no_cursor_version();
console.log("All tests passed.");
