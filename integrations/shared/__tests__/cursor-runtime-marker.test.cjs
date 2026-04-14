// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  EDITOR_RUNTIME_MARKER_TTL_MS,
  isEditorRuntimeMarkerFresh,
  touchEditorRuntimeMarker,
} = require("../editor-runtime-marker.cjs");

function touch_and_read_fresh_marker() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cursor-marker-"));
  try {
    const ok = touchEditorRuntimeMarker(root, "cursor", "conv-123");
    assert.strictEqual(ok, true);
    const fresh = isEditorRuntimeMarkerFresh(root, "cursor", "conv-123");
    assert.strictEqual(fresh, true);
    console.log("touch_and_read_fresh_marker: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function marker_expires_by_ttl() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cursor-marker-"));
  try {
    touchEditorRuntimeMarker(root, "cursor", "conv-123");
    // Simulate the marker being older than the TTL by advancing nowMs
    const futureNow = Date.now() + EDITOR_RUNTIME_MARKER_TTL_MS + 1000;
    const fresh = isEditorRuntimeMarkerFresh(root, "cursor", "conv-123", futureNow);
    assert.strictEqual(fresh, false);
    console.log("marker_expires_by_ttl: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function different_conversation_ids_are_isolated() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cursor-marker-"));
  try {
    touchEditorRuntimeMarker(root, "cursor", "conv-A");
    assert.strictEqual(isEditorRuntimeMarkerFresh(root, "cursor", "conv-A"), true);
    assert.strictEqual(isEditorRuntimeMarkerFresh(root, "cursor", "conv-B"), false);
    console.log("different_conversation_ids_are_isolated: pass");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

touch_and_read_fresh_marker();
marker_expires_by_ttl();
different_conversation_ids_are_isolated();
console.log("All tests passed.");
