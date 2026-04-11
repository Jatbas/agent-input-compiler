// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { readModelFromTranscript } = require("../read-model-from-transcript.cjs");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("pass:", name);
    passed++;
  } catch (err) {
    console.error("FAIL:", name, err.message);
    failed++;
  }
}

function writeTmp(name, content) {
  const p = path.join(os.tmpdir(), `aic-test-transcript-${name}-${Date.now()}.jsonl`);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

// --- null / empty path ---
test("returns_null_for_null_path", () => {
  assert.strictEqual(readModelFromTranscript(null), null);
});

test("returns_null_for_empty_path", () => {
  assert.strictEqual(readModelFromTranscript(""), null);
});

test("returns_null_for_missing_file", () => {
  assert.strictEqual(
    readModelFromTranscript("/tmp/aic-nonexistent-file-xyz.jsonl"),
    null,
  );
});

// --- no assistant messages (turn 0 / turn 1) ---
test("returns_null_when_no_assistant_messages", () => {
  const p = writeTmp(
    "no-model",
    [
      JSON.stringify({ type: "queue-operation", operation: "enqueue" }),
      JSON.stringify({ type: "attachment", hookEvent: "SessionStart" }),
      JSON.stringify({ type: "user" }),
    ].join("\n"),
  );
  try {
    assert.strictEqual(readModelFromTranscript(p), null);
  } finally {
    fs.unlinkSync(p);
  }
});

// --- assistant message with model present ---
test("returns_model_from_assistant_message", () => {
  const record = {
    parentUuid: "abc",
    isSidechain: false,
    message: {
      model: "claude-sonnet-4-6",
      type: "message",
      role: "assistant",
      content: [],
    },
  };
  const p = writeTmp(
    "with-model",
    [JSON.stringify({ type: "queue-operation" }), JSON.stringify(record)].join("\n"),
  );
  try {
    assert.strictEqual(readModelFromTranscript(p), "claude-sonnet-4-6");
  } finally {
    fs.unlinkSync(p);
  }
});

// --- returns the LAST model when multiple assistant messages exist ---
test("returns_last_model_when_multiple_present", () => {
  const makeRecord = (model) =>
    JSON.stringify({
      message: { model, type: "message", role: "assistant", content: [] },
    });
  const p = writeTmp(
    "multi-model",
    [
      makeRecord("claude-haiku-4-5"),
      JSON.stringify({ type: "user" }),
      makeRecord("claude-sonnet-4-6"),
    ].join("\n"),
  );
  try {
    assert.strictEqual(readModelFromTranscript(p), "claude-sonnet-4-6");
  } finally {
    fs.unlinkSync(p);
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${passed} tests passed`);
