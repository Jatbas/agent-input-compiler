// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { touchEditorRuntimeMarker } = require("../../shared/editor-runtime-marker.cjs");
const { isClaudeNativeHookPayload } = require("../is-claude-native-hook-payload.cjs");

// ── true positives ────────────────────────────────────────────────────────────

function recognizes_transcript_path_as_native_claude() {
  const payload = {
    session_id: "sess-abc",
    transcript_path: "/Users/dev/.claude/projects/foo/abc.jsonl",
    tool_name: "aic_compile",
    tool_input: { intent: "fix bug", projectRoot: "/tmp/proj" },
  };
  assert.strictEqual(isClaudeNativeHookPayload(payload), true);
  console.log("recognizes_transcript_path_as_native_claude: pass");
}

function recognizes_transcript_path_nested_under_input() {
  const payload = {
    input: {
      session_id: "sess-def",
      transcript_path: "/Users/dev/.claude/projects/foo/def.jsonl",
    },
  };
  assert.strictEqual(isClaudeNativeHookPayload(payload), true);
  console.log("recognizes_transcript_path_nested_under_input: pass");
}

function recognizes_fresh_claude_marker_without_transcript_path() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-native-"));
  try {
    const conversationId = "conv-claude-abc";
    touchEditorRuntimeMarker(root, "claude-code", conversationId);
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    const payload = { conversation_id: conversationId, cwd: root };
    const result = isClaudeNativeHookPayload(payload);
    if (prev === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = prev;
    }
    assert.strictEqual(result, true);
    console.log("recognizes_fresh_claude_marker_without_transcript_path: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ── true negatives ────────────────────────────────────────────────────────────

function rejects_null_input() {
  assert.strictEqual(isClaudeNativeHookPayload(null), false);
  console.log("rejects_null_input: pass");
}

function rejects_undefined_input() {
  assert.strictEqual(isClaudeNativeHookPayload(undefined), false);
  console.log("rejects_undefined_input: pass");
}

function rejects_non_object_input() {
  assert.strictEqual(isClaudeNativeHookPayload("string"), false);
  assert.strictEqual(isClaudeNativeHookPayload(42), false);
  assert.strictEqual(isClaudeNativeHookPayload([]), false);
  console.log("rejects_non_object_input: pass");
}

function rejects_empty_object() {
  assert.strictEqual(isClaudeNativeHookPayload({}), false);
  console.log("rejects_empty_object: pass");
}

function rejects_cursor_native_payload() {
  // Cursor payloads carry cursor_version — must return false even if transcript_path present
  const payload = {
    cursor_version: "1.0",
    conversation_id: "cursor-conv-xyz",
    generation_id: "gen-001",
  };
  assert.strictEqual(isClaudeNativeHookPayload(payload), false);
  console.log("rejects_cursor_native_payload: pass");
}

function rejects_cursor_version_nested_under_input() {
  const payload = {
    input: { cursor_version: "1.0", conversation_id: "cursor-conv" },
  };
  assert.strictEqual(isClaudeNativeHookPayload(payload), false);
  console.log("rejects_cursor_version_nested_under_input: pass");
}

function rejects_without_marker_or_transcript() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-neg-"));
  try {
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    // Has conversation_id but no transcript_path and no marker — cursor-claude-code scenario
    const payload = { conversation_id: "cursor-hosted-conv", cwd: root };
    const result = isClaudeNativeHookPayload(payload);
    if (prev === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = prev;
    }
    assert.strictEqual(result, false);
    console.log("rejects_without_marker_or_transcript: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ── cursor-claude-code edge case ──────────────────────────────────────────────

function rejects_cursor_claude_code_payload() {
  // cursor-claude-code: has conversation_id (from Cursor), no transcript_path,
  // no cursor_version. Must return false — this is Cursor hosting Claude, not
  // native Claude Code.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-ccc-"));
  try {
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    const payload = {
      conversation_id: "cursor-conversation-uuid",
      tool_name: "aic_compile",
      tool_input: { intent: "fix bug", projectRoot: root },
    };
    const result = isClaudeNativeHookPayload(payload);
    if (prev === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = prev;
    }
    assert.strictEqual(result, false);
    console.log("rejects_cursor_claude_code_payload: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function cursor_claude_code_marker_written_under_cursor_id_does_not_bleed() {
  // A "cursor" marker written for a conversationId must not make isClaudeNativeHookPayload
  // return true for a payload carrying the same id without transcript_path.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-bleed-"));
  try {
    const conversationId = "shared-uuid-xyz";
    // Write a cursor marker (not claude-code)
    touchEditorRuntimeMarker(root, "cursor", conversationId);
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    const payload = { conversation_id: conversationId, cwd: root };
    const result = isClaudeNativeHookPayload(payload);
    if (prev === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = prev;
    }
    assert.strictEqual(result, false);
    console.log("cursor_claude_code_marker_written_under_cursor_id_does_not_bleed: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

recognizes_transcript_path_as_native_claude();
recognizes_transcript_path_nested_under_input();
recognizes_fresh_claude_marker_without_transcript_path();
rejects_null_input();
rejects_undefined_input();
rejects_non_object_input();
rejects_empty_object();
rejects_cursor_native_payload();
rejects_cursor_version_nested_under_input();
rejects_without_marker_or_transcript();
rejects_cursor_claude_code_payload();
cursor_claude_code_marker_written_under_cursor_id_does_not_bleed();
console.log("All tests passed.");
