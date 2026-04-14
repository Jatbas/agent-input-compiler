// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { touchEditorRuntimeMarker } = require("../editor-runtime-marker.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");

function recognizes_cursor_version_directly() {
  const out = isCursorNativeHookPayload({ cursor_version: "1" });
  assert.strictEqual(out, true);
  console.log("recognizes_cursor_version_directly: pass");
}

function recognizes_fresh_cursor_marker_without_cursor_version() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cursor-native-"));
  try {
    touchEditorRuntimeMarker(root, "cursor", "conv-123");
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    const out = isCursorNativeHookPayload({ conversation_id: "conv-123", cwd: root });
    if (prev === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = prev;
    }
    assert.strictEqual(out, true);
    console.log("recognizes_fresh_cursor_marker_without_cursor_version: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function rejects_without_marker_or_cursor_version() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cursor-native-"));
  try {
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    const out = isCursorNativeHookPayload({ conversation_id: "conv-999", cwd: root });
    if (prev === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = prev;
    }
    assert.strictEqual(out, false);
    console.log("rejects_without_marker_or_cursor_version: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

recognizes_cursor_version_directly();
recognizes_fresh_cursor_marker_without_cursor_version();
rejects_without_marker_or_cursor_version();
console.log("All tests passed.");
