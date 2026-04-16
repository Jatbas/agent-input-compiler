// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  RECENCY_WINDOW_MS,
  recencyFilePath,
  lastConversationIdPath,
  turnMarkerPath,
  writeCompileRecency,
  isCompileRecent,
  writeTurnStart,
  writeTurnCompiled,
  isTurnCompiled,
  writeLastConversationId,
  readLastConversationId,
} = require("../compile-recency.cjs");

const ROOT = "/tmp/aic-compile-recency-test";
const CONV = "compile-recency-test-conv-1234";

function recency_write_and_read() {
  const fp = recencyFilePath(ROOT);
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  assert.strictEqual(isCompileRecent(ROOT), false);
  writeCompileRecency(ROOT);
  assert.strictEqual(isCompileRecent(ROOT), true);
  console.log("recency_write_and_read: pass");
}

function recency_expires_by_window() {
  writeCompileRecency(ROOT);
  // Simulate old timestamp by writing a stale value directly
  fs.writeFileSync(recencyFilePath(ROOT), String(Date.now() - RECENCY_WINDOW_MS - 1));
  assert.strictEqual(isCompileRecent(ROOT), false);
  console.log("recency_expires_by_window: pass");
}

function recency_missing_file_returns_false() {
  try {
    fs.unlinkSync(recencyFilePath(ROOT));
  } catch {
    /* ignore */
  }
  assert.strictEqual(isCompileRecent(ROOT), false);
  console.log("recency_missing_file_returns_false: pass");
}

function turn_marker_path_is_stable() {
  const p1 = turnMarkerPath(ROOT, CONV, "start");
  const p2 = turnMarkerPath(ROOT, CONV, "start");
  assert.strictEqual(p1, p2);
  assert.ok(p1.includes("aic-turn-start-"));
  console.log("turn_marker_path_is_stable: pass");
}

function turn_marker_path_differs_by_kind() {
  const start = turnMarkerPath(ROOT, CONV, "start");
  const compiled = turnMarkerPath(ROOT, CONV, "compiled");
  assert.notStrictEqual(start, compiled);
  assert.ok(start.includes("aic-turn-start-"));
  assert.ok(compiled.includes("aic-turn-compiled-"));
  console.log("turn_marker_path_differs_by_kind: pass");
}

function turn_marker_path_differs_by_conversation() {
  const p1 = turnMarkerPath(ROOT, "conv-A", "start");
  const p2 = turnMarkerPath(ROOT, "conv-B", "start");
  assert.notStrictEqual(p1, p2);
  console.log("turn_marker_path_differs_by_conversation: pass");
}

function isTurnCompiled_false_when_no_files() {
  for (const kind of ["start", "compiled"]) {
    try {
      fs.unlinkSync(turnMarkerPath(ROOT, CONV, kind));
    } catch {
      /* ignore */
    }
  }
  assert.strictEqual(isTurnCompiled(ROOT, CONV), false);
  console.log("isTurnCompiled_false_when_no_files: pass");
}

function isTurnCompiled_false_when_only_start_written() {
  for (const kind of ["start", "compiled"]) {
    try {
      fs.unlinkSync(turnMarkerPath(ROOT, CONV, kind));
    } catch {
      /* ignore */
    }
  }
  writeTurnStart(ROOT, CONV);
  assert.strictEqual(isTurnCompiled(ROOT, CONV), false);
  console.log("isTurnCompiled_false_when_only_start_written: pass");
}

function isTurnCompiled_true_after_both_written() {
  const FRESH_CONV = "compile-recency-fresh-conv-99";
  for (const kind of ["start", "compiled"]) {
    try {
      fs.unlinkSync(turnMarkerPath(ROOT, FRESH_CONV, kind));
    } catch {
      /* ignore */
    }
  }
  writeTurnStart(ROOT, FRESH_CONV);
  writeTurnCompiled(ROOT, FRESH_CONV);
  assert.strictEqual(isTurnCompiled(ROOT, FRESH_CONV), true);
  console.log("isTurnCompiled_true_after_both_written: pass");
}

function isTurnCompiled_false_when_compiled_before_start() {
  const STALE_CONV = "compile-recency-stale-conv-77";
  for (const kind of ["start", "compiled"]) {
    try {
      fs.unlinkSync(turnMarkerPath(ROOT, STALE_CONV, kind));
    } catch {
      /* ignore */
    }
  }
  // Write compiled first with an old timestamp, then a newer start
  fs.writeFileSync(
    turnMarkerPath(ROOT, STALE_CONV, "compiled"),
    String(Date.now() - 100),
  );
  fs.writeFileSync(turnMarkerPath(ROOT, STALE_CONV, "start"), String(Date.now()));
  assert.strictEqual(isTurnCompiled(ROOT, STALE_CONV), false);
  console.log("isTurnCompiled_false_when_compiled_before_start: pass");
}

function recency_config_override_window() {
  const configRoot = "/tmp/aic-recency-config-override-test";
  fs.mkdirSync(configRoot, { recursive: true });
  fs.writeFileSync(
    path.join(configRoot, "aic.config.json"),
    JSON.stringify({ compileRecencyWindowSecs: 10 }),
  );
  // 5 seconds old — within 10-second config window
  fs.writeFileSync(recencyFilePath(configRoot), String(Date.now() - 5000));
  assert.strictEqual(isCompileRecent(configRoot), true);
  // 15 seconds old — outside 10-second config window
  fs.writeFileSync(recencyFilePath(configRoot), String(Date.now() - 15000));
  assert.strictEqual(isCompileRecent(configRoot), false);
  try {
    fs.unlinkSync(path.join(configRoot, "aic.config.json"));
  } catch {}
  try {
    fs.unlinkSync(recencyFilePath(configRoot));
  } catch {}
  console.log("recency_config_override_window: pass");
}

function last_ccid_write_and_read() {
  const root = "/tmp/aic-last-ccid-test-root-1";
  const fp = lastConversationIdPath(root);
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  assert.strictEqual(readLastConversationId(root), null);
  writeLastConversationId(root, "conv-abc-123");
  assert.strictEqual(readLastConversationId(root), "conv-abc-123");
  console.log("last_ccid_write_and_read: pass");
}

function last_ccid_returns_null_on_missing_file() {
  const root = "/tmp/aic-last-ccid-test-root-missing-xyz";
  const fp = lastConversationIdPath(root);
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  assert.strictEqual(readLastConversationId(root), null);
  console.log("last_ccid_returns_null_on_missing_file: pass");
}

function last_ccid_overwrites_previous_value() {
  const root = "/tmp/aic-last-ccid-test-root-2";
  writeLastConversationId(root, "first-id");
  writeLastConversationId(root, "second-id");
  assert.strictEqual(readLastConversationId(root), "second-id");
  console.log("last_ccid_overwrites_previous_value: pass");
}

function last_ccid_path_is_stable_and_differs_by_root() {
  const p1 = lastConversationIdPath("/tmp/root-A");
  const p2 = lastConversationIdPath("/tmp/root-A");
  const p3 = lastConversationIdPath("/tmp/root-B");
  assert.strictEqual(p1, p2);
  assert.notStrictEqual(p1, p3);
  assert.ok(p1.includes("aic-last-ccid-"));
  console.log("last_ccid_path_is_stable_and_differs_by_root: pass");
}

recency_write_and_read();
recency_expires_by_window();
recency_config_override_window();
recency_missing_file_returns_false();
turn_marker_path_is_stable();
turn_marker_path_differs_by_kind();
turn_marker_path_differs_by_conversation();
isTurnCompiled_false_when_no_files();
isTurnCompiled_false_when_only_start_written();
isTurnCompiled_true_after_both_written();
isTurnCompiled_false_when_compiled_before_start();
last_ccid_write_and_read();
last_ccid_returns_null_on_missing_file();
last_ccid_overwrites_previous_value();
last_ccid_path_is_stable_and_differs_by_root();
console.log("All compile-recency tests passed.");
