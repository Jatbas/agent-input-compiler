// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { run } = require(path.join(__dirname, "..", "hooks", "aic-pre-tool-gate.cjs"));
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

function denyCountFile(conversationId) {
  return path.join(os.tmpdir(), `aic-gate-cc-deny-${conversationId.slice(0, 64)}`);
}

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
    try {
      fs.unlinkSync(denyCountFile(convId));
    } catch {
      /* ignore */
    }
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
  const out = run(makePayload());
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
  console.log("deny_when_no_compile: pass");
}

function allow_after_max_denies() {
  setup();
  fs.writeFileSync(denyCountFile(TEST_CONV_ID), "3");
  const out = run(makePayload());
  if (out !== "{}") {
    throw new Error(`Expected allow after MAX_DENIES, got ${out}`);
  }
  console.log("allow_after_max_denies: pass");
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

function deny_count_increments() {
  setup();
  run(makePayload());
  run(makePayload());
  const count = Number(fs.readFileSync(denyCountFile(TEST_CONV_ID), "utf8").trim());
  if (count !== 2) {
    throw new Error(`Expected deny count 2, got ${count}`);
  }
  console.log("deny_count_increments: pass");
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

function deny_count_cleared_on_recent_compile() {
  setup();
  fs.writeFileSync(denyCountFile(TEST_CONV_ID), "2");
  writeCompileRecency(TEST_ROOT);
  run(makePayload()); // should hit isCompileRecent path and clear deny count
  const exists = fs.existsSync(denyCountFile(TEST_CONV_ID));
  if (exists) {
    throw new Error("Expected deny count file to be cleared after recent compile");
  }
  console.log("deny_count_cleared_on_recent_compile: pass");
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

allow_when_recent_compile();
deny_when_no_compile();
allow_after_max_denies();
allow_and_write_recency_for_aic_compile_call();
deny_count_increments();
allow_cursor_native_payload();
allow_malformed_json();
deny_count_cleared_on_recent_compile();
allow_when_turn_compiled();
deny_when_turn_start_but_not_compiled();
allow_tool_search_for_aic_compile_schema();
allow_when_subdir_cwd_has_aic_config_in_parent();
console.log("All aic-pre-tool-gate tests passed.");
