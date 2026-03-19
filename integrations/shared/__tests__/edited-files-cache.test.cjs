// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  getTempPath,
  readEditedFiles,
  writeEditedFiles,
  cleanupEditedFiles,
} = require("../edited-files-cache.cjs");

let keyCounter = 0;

function getTempPath_returns_path_with_unified_prefix() {
  const p = getTempPath("cursor", "k1");
  assert.ok(p.includes("aic-edited-cursor-"), "path should include prefix");
  assert.ok(p.includes("k1"), "path should include key");
  assert.ok(p.endsWith(".json"), "path should end with .json");
  assert.ok(p.startsWith(os.tmpdir()), "path should be under os.tmpdir()");
}

function getTempPath_sanitizes_editorId_and_key() {
  const p = getTempPath("x", "a/b c");
  assert.ok(p.includes("aic-edited-x-"), "path should include sanitized editorId");
  const keySegment = path.basename(p).replace("aic-edited-x-", "").replace(".json", "");
  assert.ok(!keySegment.includes("/"), "key segment should have no slash");
  assert.ok(!keySegment.includes(" "), "key segment should have no space");
}

function getTempPath_returns_path_for_claude_code_editorId() {
  const p = getTempPath("claude_code", "k1");
  assert.ok(p.includes("aic-edited-claude_code-"), "path should include prefix");
  assert.ok(p.includes("k1"), "path should include key");
  assert.ok(p.endsWith(".json"), "path should end with .json");
  assert.ok(p.startsWith(os.tmpdir()), "path should be under os.tmpdir()");
}

function readEditedFiles_returns_empty_when_missing() {
  const result = readEditedFiles("editor", "nonexistent-key-12345");
  assert.deepStrictEqual(result, []);
}

function readEditedFiles_returns_parsed_array() {
  const key = "parsed-" + ++keyCounter;
  const editorId = "editor";
  const tmpPath = getTempPath(editorId, key);
  fs.writeFileSync(tmpPath, '["/p1","/p2"]', "utf8");
  try {
    const result = readEditedFiles(editorId, key);
    assert.deepStrictEqual(result, ["/p1", "/p2"]);
  } finally {
    cleanupEditedFiles(editorId, key);
  }
}

function readEditedFiles_returns_empty_on_invalid_json() {
  const key = "invalid-" + ++keyCounter;
  const editorId = "editor";
  const tmpPath = getTempPath(editorId, key);
  fs.writeFileSync(tmpPath, "not json", "utf8");
  try {
    const result = readEditedFiles(editorId, key);
    assert.deepStrictEqual(result, []);
  } finally {
    cleanupEditedFiles(editorId, key);
  }
}

function writeEditedFiles_creates_file_and_merge() {
  const key = "merge-" + ++keyCounter;
  const editorId = "editor";
  try {
    writeEditedFiles(editorId, key, ["/a"]);
    writeEditedFiles(editorId, key, ["/b"]);
    const r = readEditedFiles(editorId, key);
    assert.strictEqual(r.length, 2);
    assert.ok(r.includes("/a"));
    assert.ok(r.includes("/b"));
    writeEditedFiles(editorId, key, ["/a"]);
    const r2 = readEditedFiles(editorId, key);
    assert.strictEqual(r2.length, 2, "duplicate /a should not be added");
  } finally {
    cleanupEditedFiles(editorId, key);
  }
}

function cleanupEditedFiles_removes_file() {
  const key = "cleanup-" + ++keyCounter;
  const editorId = "editor";
  writeEditedFiles(editorId, key, ["/x"]);
  cleanupEditedFiles(editorId, key);
  const result = readEditedFiles(editorId, key);
  assert.deepStrictEqual(result, []);
}

const cases = [
  getTempPath_returns_path_with_unified_prefix,
  getTempPath_sanitizes_editorId_and_key,
  getTempPath_returns_path_for_claude_code_editorId,
  readEditedFiles_returns_empty_when_missing,
  readEditedFiles_returns_parsed_array,
  readEditedFiles_returns_empty_on_invalid_json,
  writeEditedFiles_creates_file_and_merge,
  cleanupEditedFiles_removes_file,
];

let failed = 0;
for (const fn of cases) {
  try {
    fn();
  } catch (err) {
    failed += 1;
    console.error("FAIL", fn.name, err.message);
  }
}
if (failed > 0) {
  process.exit(1);
}
