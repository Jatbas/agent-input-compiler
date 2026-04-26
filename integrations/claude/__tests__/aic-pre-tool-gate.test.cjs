// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { run } = require(path.join(__dirname, "..", "hooks", "aic-pre-tool-gate.cjs"));

const SIBLING_POLL_TOTAL_MS = 500;
const HOOK_SCRIPT = path.join(__dirname, "..", "hooks", "aic-pre-tool-gate.cjs");

function runHookInChild(payloadStr) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on("data", (buf) => {
      stderr += buf.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`hook exited ${code}: ${stderr}`));
      else resolve(stdout);
    });
    child.stdin.write(payloadStr);
    child.stdin.end();
  });
}
const {
  recencyFilePath,
  turnMarkerPath,
  writeCompileRecency,
  writeTurnStart,
  writeTurnCompiled,
} = require(path.join(__dirname, "..", "..", "shared", "compile-recency.cjs"));

const TEST_ROOT = "/tmp/aic-test-gate-project";
const TEST_CONV_ID = "test-gate-conv-1234-5678-9abc";
const TURN_COMPILED_ID = "test-gate-turn-compiled-id-1111";
const TURN_PARTIAL_ID = "test-gate-turn-partial-id-2222";

function makePayload(overrides = {}) {
  return JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "echo hi" },
    cwd: TEST_ROOT,
    conversation_id: TEST_CONV_ID,
    ...overrides,
  });
}

function cleanTurnMarkers(root, convId) {
  for (const kind of ["start", "compiled"]) {
    try {
      fs.unlinkSync(turnMarkerPath(root, convId, kind));
    } catch {
      /* ignore */
    }
  }
}

function setup() {
  try {
    fs.unlinkSync(recencyFilePath(TEST_ROOT));
  } catch {
    /* ignore */
  }
  for (const convId of [TEST_CONV_ID, TURN_COMPILED_ID, TURN_PARTIAL_ID]) {
    cleanTurnMarkers(TEST_ROOT, convId);
  }
}

function allow_when_recent_compile() {
  setup();
  writeCompileRecency(TEST_ROOT);
  const out = run(makePayload());
  if (out !== "{}") {
    throw new Error(`Expected allow ("{}"), got ${out}`);
  }
  console.log("allow_when_recent_compile: pass");
}

function deny_when_no_compile() {
  setup();
  const start = Date.now();
  const out = run(makePayload());
  const elapsed = Date.now() - start;
  const parsed = JSON.parse(out);
  if (parsed.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(
      `Expected permissionDecision "deny", got ${parsed.hookSpecificOutput?.permissionDecision}`,
    );
  }
  const reason = parsed.hookSpecificOutput?.permissionDecisionReason ?? "";
  if (!reason.includes("compile_required")) {
    throw new Error(`Expected reason to include "compile_required", got: ${reason}`);
  }
  if (!reason.includes("aic_compile")) {
    throw new Error(`Expected reason to include "aic_compile", got: ${reason}`);
  }
  if (elapsed < 400) {
    throw new Error(
      `Expected deny path to run the sibling-poll (>=400ms), got ${elapsed}ms`,
    );
  }
  console.log("deny_when_no_compile: pass");
}

function deny_indefinitely_without_compile() {
  setup();
  for (let i = 0; i < 5; i++) {
    const out = run(makePayload());
    const parsed = JSON.parse(out);
    if (parsed.hookSpecificOutput?.permissionDecision !== "deny") {
      throw new Error(
        `Expected deny on attempt ${i + 1} (no 3-strike bypass), got ${out}`,
      );
    }
  }
  console.log("deny_indefinitely_without_compile: pass");
}

function allow_and_write_recency_for_aic_compile_call() {
  setup();
  const before = recencyFilePath(TEST_ROOT);
  try {
    fs.unlinkSync(before);
  } catch {
    /* ignore */
  }
  const out = run(
    JSON.stringify({
      tool_name: "mcp__aic-dev__aic_compile",
      tool_input: { intent: "test intent", projectRoot: TEST_ROOT },
      cwd: TEST_ROOT,
      conversation_id: TEST_CONV_ID,
    }),
  );
  if (out !== "{}") {
    throw new Error(`Expected allow for aic_compile call, got ${out}`);
  }
  if (!fs.existsSync(before)) {
    throw new Error("Expected recency file to be written after aic_compile detection");
  }
  console.log("allow_and_write_recency_for_aic_compile_call: pass");
}

async function allow_when_sibling_compile_writes_during_poll() {
  setup();
  const start = Date.now();
  const childPromise = runHookInChild(makePayload());
  setTimeout(() => {
    writeCompileRecency(TEST_ROOT);
  }, 100);
  const out = await childPromise;
  const elapsed = Date.now() - start;
  if (out !== "{}") {
    throw new Error(`Expected allow via sibling-poll, got ${out} after ${elapsed}ms`);
  }
  if (elapsed >= SIBLING_POLL_TOTAL_MS) {
    throw new Error(
      `Expected early exit from poll (<${SIBLING_POLL_TOTAL_MS}ms), got ${elapsed}ms`,
    );
  }
  console.log("allow_when_sibling_compile_writes_during_poll: pass");
}

async function deny_after_poll_timeout_without_sibling() {
  setup();
  const start = Date.now();
  const out = await runHookInChild(makePayload());
  const elapsed = Date.now() - start;
  const parsed = JSON.parse(out);
  if (parsed.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(`Expected deny after poll timeout, got ${out}`);
  }
  if (elapsed < SIBLING_POLL_TOTAL_MS - 50) {
    throw new Error(
      `Expected poll to run for ~${SIBLING_POLL_TOTAL_MS}ms, got ${elapsed}ms`,
    );
  }
  console.log("deny_after_poll_timeout_without_sibling: pass");
}

function allow_cursor_native_payload() {
  setup();
  const out = run(
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      cursor_version: "0.40.0",
      conversation_id: "cursor-conv-id",
    }),
  );
  if (out !== "{}") {
    throw new Error(`Expected allow for cursor payload, got ${out}`);
  }
  console.log("allow_cursor_native_payload: pass");
}

function allow_malformed_json() {
  // Malformed JSON hits the inner catch and returns allow immediately
  const out = run("not json");
  if (out !== "{}") throw new Error(`Expected "{}" for malformed JSON, got ${out}`);
  console.log("allow_malformed_json: pass");
}

function allow_when_turn_compiled() {
  setup();
  writeTurnStart(TEST_ROOT, TURN_COMPILED_ID);
  writeTurnCompiled(TEST_ROOT, TURN_COMPILED_ID);
  const out = run(
    makePayload({
      transcript_path: `/tmp/.claude/conversations/${TURN_COMPILED_ID}.jsonl`,
    }),
  );
  if (out !== "{}") {
    throw new Error(`Expected allow via isTurnCompiled, got ${out}`);
  }
  console.log("allow_when_turn_compiled: pass");
}

function deny_when_turn_start_but_not_compiled() {
  setup();
  writeTurnStart(TEST_ROOT, TURN_PARTIAL_ID);
  const out = run(
    makePayload({
      transcript_path: `/tmp/.claude/conversations/${TURN_PARTIAL_ID}.jsonl`,
    }),
  );
  const parsed = JSON.parse(out);
  if (parsed.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(
      `Expected deny when turn started but not compiled, got ${JSON.stringify(parsed)}`,
    );
  }
  console.log("deny_when_turn_start_but_not_compiled: pass");
}

function allow_tool_search_for_aic_compile_schema() {
  setup();
  const out = run(
    JSON.stringify({
      tool_name: "ToolSearch",
      tool_input: { query: "select:mcp__aic-dev__aic_compile" },
      cwd: TEST_ROOT,
      conversation_id: TEST_CONV_ID,
    }),
  );
  if (out !== "{}") {
    throw new Error(`Expected allow for ToolSearch aic_compile query, got ${out}`);
  }
  console.log("allow_tool_search_for_aic_compile_schema: pass");
}

function allow_when_subdir_cwd_has_aic_config_in_parent() {
  setup();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-gate-subdir-test-"));
  try {
    const subDir = path.join(tmpDir, "mcp");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), "{}");
    writeCompileRecency(tmpDir);
    const out = run(
      JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: path.join(subDir, "server.ts") },
        cwd: subDir,
        conversation_id: TEST_CONV_ID,
      }),
    );
    if (out !== "{}") {
      throw new Error(`Expected allow when parent dir has recent compile, got ${out}`);
    }
    console.log("allow_when_subdir_cwd_has_aic_config_in_parent: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function deny_when_gate_throws_unexpected_error_BUGS09() {
  const gatePath = path.join(__dirname, "..", "hooks", "aic-pre-tool-gate.cjs");
  const prewarmModPath = path.join(
    __dirname,
    "..",
    "..",
    "shared",
    "read-aic-prewarm-prompt.cjs",
  );
  delete require.cache[gatePath];
  delete require.cache[prewarmModPath];
  const prewarmMod = require(prewarmModPath);
  const origRead = prewarmMod.readAicPrewarmPrompt;
  prewarmMod.readAicPrewarmPrompt = () => {
    throw new Error("simulated unexpected pre-tool-gate dependency failure");
  };
  const { run: runWithThrowingPrewarm } = require(gatePath);
  setup();
  const start = Date.now();
  const out = runWithThrowingPrewarm(makePayload());
  const elapsed = Date.now() - start;
  prewarmMod.readAicPrewarmPrompt = origRead;
  delete require.cache[gatePath];
  delete require.cache[prewarmModPath];
  const parsed = JSON.parse(out);
  if (parsed.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(
      `BUGS-09 regression: expected deny on unexpected gate error, got ${out}`,
    );
  }
  const reason = parsed.hookSpecificOutput?.permissionDecisionReason ?? "";
  if (!reason.includes("compile_gate_error")) {
    throw new Error(`Expected compile_gate_error in reason, got: ${reason}`);
  }
  if (elapsed < 400) {
    throw new Error(`Expected sibling poll before deny path, got ${elapsed}ms`);
  }
  console.log("deny_when_gate_throws_unexpected_error_BUGS09: pass");
}

async function runAll() {
  allow_when_recent_compile();
  deny_when_no_compile();
  deny_indefinitely_without_compile();
  allow_and_write_recency_for_aic_compile_call();
  await allow_when_sibling_compile_writes_during_poll();
  await deny_after_poll_timeout_without_sibling();
  allow_cursor_native_payload();
  allow_malformed_json();
  allow_when_turn_compiled();
  deny_when_turn_start_but_not_compiled();
  allow_tool_search_for_aic_compile_schema();
  allow_when_subdir_cwd_has_aic_config_in_parent();
  deny_when_gate_throws_unexpected_error_BUGS09();
  console.log("All aic-pre-tool-gate tests passed.");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
