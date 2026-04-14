// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");
const { run } = require(
  path.join(__dirname, "..", "hooks", "aic-stop-require-compile.cjs"),
);
const { recencyFilePath, writeCompileRecency } = require(
  path.join(__dirname, "..", "..", "shared", "compile-recency.cjs"),
);

const TEST_ROOT = "/tmp/aic-test-stop-project";
const TEST_CONV_ID = "test-stop-conv-aaaa-bbbb-cccc";

function stopBlockFile(conversationId) {
  return path.join(
    os.tmpdir(),
    `aic-stop-cc-block-${String(conversationId).slice(0, 64)}`,
  );
}

function makePayload(overrides = {}) {
  return JSON.stringify({
    cwd: TEST_ROOT,
    conversation_id: TEST_CONV_ID,
    ...overrides,
  });
}

function setup() {
  try {
    fs.unlinkSync(recencyFilePath(TEST_ROOT));
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(stopBlockFile(TEST_CONV_ID));
  } catch {
    /* ignore */
  }
}

function allow_when_recent_compile() {
  setup();
  writeCompileRecency(TEST_ROOT);
  const out = run(makePayload());
  if (out !== "") {
    throw new Error(`Expected empty string (allow), got ${JSON.stringify(out)}`);
  }
  console.log("allow_when_recent_compile: pass");
}

function block_when_no_compile() {
  setup();
  const out = run(makePayload());
  const parsed = JSON.parse(out);
  if (parsed.decision !== "block") {
    throw new Error(`Expected decision "block", got ${parsed.decision}`);
  }
  if (!parsed.reason || !parsed.reason.includes("aic_compile")) {
    throw new Error(`Expected reason to include "aic_compile", got: ${parsed.reason}`);
  }
  console.log("block_when_no_compile: pass");
}

function allow_after_max_stop_blocks() {
  setup();
  fs.writeFileSync(stopBlockFile(TEST_CONV_ID), "2");
  const out = run(makePayload());
  if (out !== "") {
    throw new Error(`Expected allow after MAX_STOP_BLOCKS, got ${JSON.stringify(out)}`);
  }
  console.log("allow_after_max_stop_blocks: pass");
}

function block_count_increments() {
  setup();
  run(makePayload());
  const count = Number(fs.readFileSync(stopBlockFile(TEST_CONV_ID), "utf8").trim());
  if (count !== 1) {
    throw new Error(`Expected block count 1, got ${count}`);
  }
  run(makePayload());
  const count2 = Number(fs.readFileSync(stopBlockFile(TEST_CONV_ID), "utf8").trim());
  if (count2 !== 2) {
    throw new Error(`Expected block count 2, got ${count2}`);
  }
  console.log("block_count_increments: pass");
}

function allow_cursor_native_payload() {
  setup();
  const out = run(
    JSON.stringify({
      cursor_version: "0.40.0",
      conversation_id: "cursor-conv-id",
      cwd: TEST_ROOT,
    }),
  );
  if (out !== "") {
    throw new Error(`Expected allow for cursor payload, got ${JSON.stringify(out)}`);
  }
  console.log("allow_cursor_native_payload: pass");
}

function allow_malformed_json() {
  // Malformed JSON hits the inner catch and returns allow immediately
  const out = run("not json");
  if (out !== "")
    throw new Error(`Expected "" for malformed JSON, got ${JSON.stringify(out)}`);
  console.log("allow_malformed_json: pass");
}

allow_when_recent_compile();
block_when_no_compile();
allow_after_max_stop_blocks();
block_count_increments();
allow_cursor_native_payload();
allow_malformed_json();
console.log("All aic-stop-require-compile tests passed.");
