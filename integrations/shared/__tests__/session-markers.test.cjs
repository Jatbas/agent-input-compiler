// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  acquireSessionLock,
  releaseSessionLock,
  writeSessionMarker,
  readSessionMarker,
  clearSessionMarker,
  isSessionAlreadyInjected,
} = require("../session-markers.cjs");

function acquire_release_roundtrip() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-markers-"));
  try {
    assert.strictEqual(acquireSessionLock(projectRoot), true);
    releaseSessionLock(projectRoot);
    const lock = path.join(projectRoot, ".aic", ".session-start-lock");
    assert.strictEqual(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function lock_blocks_second_caller() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-markers-"));
  try {
    assert.strictEqual(acquireSessionLock(projectRoot), true);
    assert.strictEqual(acquireSessionLock(projectRoot), false);
    releaseSessionLock(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function marker_write_read_clear() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-markers-"));
  try {
    writeSessionMarker(projectRoot, "sid1");
    assert.strictEqual(readSessionMarker(projectRoot), "sid1");
    clearSessionMarker(projectRoot);
    assert.strictEqual(readSessionMarker(projectRoot), "");
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function isSessionAlreadyInjected_true() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-markers-"));
  try {
    writeSessionMarker(projectRoot, "sid1");
    assert.strictEqual(isSessionAlreadyInjected(projectRoot, "sid1"), true);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function isSessionAlreadyInjected_false() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-markers-"));
  try {
    assert.strictEqual(isSessionAlreadyInjected(projectRoot, "sid1"), false);
    writeSessionMarker(projectRoot, "other");
    assert.strictEqual(isSessionAlreadyInjected(projectRoot, "sid1"), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const cases = [
  acquire_release_roundtrip,
  lock_blocks_second_caller,
  marker_write_read_clear,
  isSessionAlreadyInjected_true,
  isSessionAlreadyInjected_false,
];

let failed = 0;
for (const fn of cases) {
  try {
    fn();
    console.log("OK", fn.name);
  } catch (err) {
    console.error("FAIL", fn.name, err.message);
    failed += 1;
  }
}
process.exit(failed > 0 ? 1 : 0);
