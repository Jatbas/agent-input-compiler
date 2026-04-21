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

function writeSessionModelJsonl(projectRoot, entries) {
  const aicDir = path.join(projectRoot, ".aic");
  fs.mkdirSync(aicDir, { recursive: true });
  const body = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(path.join(aicDir, "session-models.jsonl"), body, "utf8");
}

function inject_modelId_from_session_cache() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-mcache-"));
  try {
    writeSessionModelJsonl(tempRoot, [
      {
        c: "conv-abc",
        m: "claude-sonnet-4",
        e: "cursor",
        timestamp: "2026-04-21T00:00:00.000Z",
      },
    ]);
    const stdin = hookPayload({
      tool_name: "aic_compile",
      tool_input: { intent: "test intent", projectRoot: tempRoot },
      conversation_id: "conv-abc",
      model: "claude-sonnet-4",
    });
    const stdout = runHook(stdin, { CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected permission "allow", got ${out.permission}`);
    }
    if (!out.updated_input || out.updated_input.modelId !== "claude-sonnet-4") {
      throw new Error(
        `Expected updated_input.modelId "claude-sonnet-4" from cache, got ${JSON.stringify(out.updated_input?.modelId)}`,
      );
    }
    console.log("inject_modelId_from_session_cache: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function inject_ignores_input_model_when_cache_empty_auto_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-automode-"));
  try {
    const stdin = hookPayload({
      tool_name: "aic_compile",
      tool_input: { intent: "test intent", projectRoot: tempRoot },
      conversation_id: "conv-auto",
      model: "claude-opus-4-7",
    });
    const stdout = runHook(stdin, { CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected permission "allow", got ${out.permission}`);
    }
    if (out.updated_input?.modelId !== undefined) {
      throw new Error(
        `Expected no modelId when cache is empty (Auto mode); got ${JSON.stringify(out.updated_input.modelId)}`,
      );
    }
    const jsonlPath = path.join(tempRoot, ".aic", "session-models.jsonl");
    if (fs.existsSync(jsonlPath)) {
      throw new Error(
        `preToolUse must not write session-models.jsonl; file exists: ${fs.readFileSync(jsonlPath, "utf8")}`,
      );
    }
    console.log("inject_ignores_input_model_when_cache_empty_auto_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

function inject_allow_when_no_conversation_with_cached_model() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-nocid-"));
  try {
    writeSessionModelJsonl(tempRoot, [
      {
        c: "",
        m: "cursor-model-1",
        e: "cursor",
        timestamp: "2026-04-21T00:00:00.000Z",
      },
    ]);
    const stdin = hookPayload({
      tool_name: "aic_compile",
      tool_input: { intent: "test intent", projectRoot: tempRoot },
      model: "cursor-model-1",
    });
    const stdout = runHook(stdin, { CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected permission "allow", got ${out.permission}`);
    }
    if (!out.updated_input) {
      throw new Error("Expected updated_input when cached model is present");
    }
    if (out.updated_input.modelId !== "cursor-model-1") {
      throw new Error(
        `Expected updated_input.modelId "cursor-model-1" from cache, got ${JSON.stringify(out.updated_input.modelId)}`,
      );
    }
    if (out.updated_input.editorId !== "cursor") {
      throw new Error(
        `Expected updated_input.editorId "cursor", got ${JSON.stringify(out.updated_input.editorId)}`,
      );
    }
    console.log("inject_allow_when_no_conversation_with_cached_model: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

function inject_omits_modelId_when_cache_has_auto_only() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-autoonly-"));
  try {
    writeSessionModelJsonl(tempRoot, [
      {
        c: "conv-abc",
        m: "auto",
        e: "cursor",
        timestamp: "2026-04-21T00:00:00.000Z",
      },
    ]);
    const stdin = hookPayload({
      tool_name: "aic_compile",
      tool_input: { intent: "test intent", projectRoot: tempRoot },
      conversation_id: "conv-abc",
      model: "default",
    });
    const stdout = runHook(stdin, { CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected permission "allow", got ${out.permission}`);
    }
    if (out.updated_input?.modelId !== undefined) {
      throw new Error(
        `Expected no modelId when cache resolves to "auto", got ${JSON.stringify(out.updated_input.modelId)}`,
      );
    }
    console.log("inject_omits_modelId_when_cache_has_auto_only: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

function call_mcp_tool_envelope_routes_to_aic_dev_in_dev_mode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-callmcp-dev-"));
  try {
    fs.writeFileSync(
      path.join(tempRoot, "aic.config.json"),
      JSON.stringify({ devMode: true }),
      "utf8",
    );
    const stdin = hookPayload({
      tool_name: "call_mcp_tool",
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
    if (out.updated_input?.server !== "aic-dev") {
      throw new Error(
        `Expected updated_input.server "aic-dev", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("call_mcp_tool_envelope_routes_to_aic_dev_in_dev_mode: pass");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

inject_modelId_from_session_cache();
inject_ignores_input_model_when_cache_empty_auto_mode();
inject_uses_session_id_fallback_for_conversation_id();
inject_allow_when_no_conversation_with_cached_model();
inject_replaces_weak_intent_with_prewarm_prompt();
inject_strips_ide_selection_from_prewarm();
inject_skips_when_prewarm_missing();
inject_omits_modelId_when_cache_has_auto_only();
mcp_envelope_routes_aic_tools_to_aic_dev_in_dev_mode();
mcp_envelope_routes_aic_tools_to_aic_outside_dev_mode();
call_mcp_tool_envelope_routes_to_aic_dev_in_dev_mode();

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

const { toCursorProjectSlug } = require("../../shared/resolve-aic-server-id.cjs");

function setupMockMcps(tempHome, tempRoot, serverId) {
  const slug = toCursorProjectSlug(tempRoot);
  const toolsDir = path.join(
    tempHome,
    ".cursor",
    "projects",
    slug,
    "mcps",
    serverId,
    "tools",
  );
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(path.join(toolsDir, "aic_compile.json"), "{}", "utf8");
  return toolsDir;
}

function mcp_envelope_rewrites_to_cursor_runtime_server_id() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-rt-"));
  setupMockMcps(tempHome, tempRoot, "project-0-MyProject-aic-dev");
  fs.writeFileSync(
    path.join(tempRoot, "aic.config.json"),
    JSON.stringify({ devMode: true }),
    "utf8",
  );
  try {
    const stdin = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "aic",
        toolName: "aic_compile",
        arguments: { intent: "test", projectRoot: tempRoot },
      },
    });
    const stdout = runHook(stdin, { HOME: tempHome, CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.updated_input?.server !== "project-0-MyProject-aic-dev") {
      throw new Error(
        `Expected runtime server id "project-0-MyProject-aic-dev", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("mcp_envelope_rewrites_to_cursor_runtime_server_id: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function call_mcp_tool_envelope_rewrites_to_cursor_runtime_server_id() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-rt-"));
  setupMockMcps(tempHome, tempRoot, "project-0-Test-aic-dev");
  fs.writeFileSync(
    path.join(tempRoot, "aic.config.json"),
    JSON.stringify({ devMode: true }),
    "utf8",
  );
  try {
    const stdin = hookPayload({
      tool_name: "call_mcp_tool",
      tool_input: {
        server: "aic-dev",
        toolName: "aic_status",
        arguments: {},
      },
    });
    const stdout = runHook(stdin, { HOME: tempHome, CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.updated_input?.server !== "project-0-Test-aic-dev") {
      throw new Error(
        `Expected "project-0-Test-aic-dev", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("call_mcp_tool_envelope_rewrites_to_cursor_runtime_server_id: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function callmcptool_envelope_rewrites_server() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-rt-"));
  setupMockMcps(tempHome, tempRoot, "user-aic");
  try {
    const stdin = hookPayload({
      tool_name: "CallMcpTool",
      tool_input: {
        server: "aic",
        toolName: "aic_compile",
        arguments: { intent: "test", projectRoot: tempRoot },
      },
    });
    const stdout = runHook(stdin, { HOME: tempHome, CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.updated_input?.server !== "user-aic") {
      throw new Error(
        `Expected "user-aic", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("callmcptool_envelope_rewrites_server: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runtime_id_noop_when_server_already_correct() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-rt-"));
  setupMockMcps(tempHome, tempRoot, "project-0-AIC-aic-dev");
  try {
    const stdin = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "project-0-AIC-aic-dev",
        toolName: "aic_inspect",
        arguments: {},
      },
    });
    const stdout = runHook(stdin, { HOME: tempHome, CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.updated_input != null) {
      throw new Error(
        `Expected no updated_input when server already matches, got ${JSON.stringify(out.updated_input)}`,
      );
    }
    console.log("runtime_id_noop_when_server_already_correct: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function non_aic_mcp_envelope_passes_through_unchanged() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-rt-"));
  setupMockMcps(tempHome, tempRoot, "project-0-AIC-aic-dev");
  try {
    const stdin = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "some-other-server",
        toolName: "some_other_tool",
        arguments: {},
      },
    });
    const stdout = runHook(stdin, { HOME: tempHome, CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.permission !== "allow") {
      throw new Error(`Expected "allow", got ${out.permission}`);
    }
    if (out.updated_input != null) {
      throw new Error(
        `Expected no updated_input for non-AIC MCP, got ${JSON.stringify(out.updated_input)}`,
      );
    }
    console.log("non_aic_mcp_envelope_passes_through_unchanged: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function fallback_to_config_name_when_no_cursor_mcps_dir() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-rt-"));
  fs.writeFileSync(
    path.join(tempRoot, "aic.config.json"),
    JSON.stringify({ devMode: true }),
    "utf8",
  );
  try {
    const stdin = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "aic",
        toolName: "aic_compile",
        arguments: { intent: "test", projectRoot: tempRoot },
      },
    });
    const stdout = runHook(stdin, { HOME: tempHome, CURSOR_PROJECT_DIR: tempRoot });
    const out = JSON.parse(stdout);
    if (out.updated_input?.server !== "aic-dev") {
      throw new Error(
        `Expected fallback "aic-dev", got ${JSON.stringify(out.updated_input?.server)}`,
      );
    }
    console.log("fallback_to_config_name_when_no_cursor_mcps_dir: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function payload_without_cursor_version_noop() {
  const stdin = JSON.stringify({
    tool_name: "mcp",
    tool_input: {
      server: "wrong-server",
      toolName: "aic_compile",
      arguments: { intent: "test", projectRoot: "/tmp" },
    },
  });
  const result = spawnSync("node", [hookPath], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.stdout.trim() !== "") {
    throw new Error(
      `Expected empty stdout for non-Cursor payload, got ${JSON.stringify(result.stdout)}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Expected exit 0, got ${result.status}`);
  }
  console.log("payload_without_cursor_version_noop: pass");
}

function multi_session_runtime_ids_isolated() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-home-"));
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-projA-"));
  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), "aic-inject-projB-"));
  setupMockMcps(tempHome, rootA, "project-0-ProjA-aic-dev");
  setupMockMcps(tempHome, rootB, "user-aic");
  try {
    const stdinA = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "aic",
        toolName: "aic_compile",
        arguments: { intent: "test", projectRoot: rootA },
      },
    });
    const outA = JSON.parse(
      runHook(stdinA, { HOME: tempHome, CURSOR_PROJECT_DIR: rootA }),
    );
    if (outA.updated_input?.server !== "project-0-ProjA-aic-dev") {
      throw new Error(
        `Session A: expected project-0-ProjA-aic-dev, got ${JSON.stringify(outA.updated_input?.server)}`,
      );
    }
    const stdinB = hookPayload({
      tool_name: "mcp",
      tool_input: {
        server: "aic",
        toolName: "aic_compile",
        arguments: { intent: "test", projectRoot: rootB },
      },
    });
    const outB = JSON.parse(
      runHook(stdinB, { HOME: tempHome, CURSOR_PROJECT_DIR: rootB }),
    );
    if (outB.updated_input?.server !== "user-aic") {
      throw new Error(
        `Session B: expected user-aic, got ${JSON.stringify(outB.updated_input?.server)}`,
      );
    }
    console.log("multi_session_runtime_ids_isolated: pass");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(rootA, { recursive: true, force: true });
    fs.rmSync(rootB, { recursive: true, force: true });
  }
}

mcp_envelope_rewrites_to_cursor_runtime_server_id();
call_mcp_tool_envelope_rewrites_to_cursor_runtime_server_id();
callmcptool_envelope_rewrites_server();
runtime_id_noop_when_server_already_correct();
non_aic_mcp_envelope_passes_through_unchanged();
fallback_to_config_name_when_no_cursor_mcps_dir();
payload_without_cursor_version_noop();
multi_session_runtime_ids_isolated();
console.log("All tests passed.");
