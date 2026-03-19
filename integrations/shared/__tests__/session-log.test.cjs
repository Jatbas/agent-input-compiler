// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { appendSessionLog } = require("../session-log.cjs");

function valid_entry_writes_one_line() {
  const dir = path.join(os.tmpdir(), `aic-session-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    appendSessionLog(dir, {
      session_id: "s1",
      reason: "user_ended",
      duration_ms: 100,
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    const logPath = path.join(dir, ".aic", "session-log.jsonl");
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.trim().split("\n");
    assert.strictEqual(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.strictEqual(parsed.session_id, "s1");
    assert.strictEqual(parsed.reason, "user_ended");
    assert.strictEqual(parsed.duration_ms, 100);
    assert.strictEqual(parsed.timestamp, "2025-01-01T00:00:00.000Z");
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "session-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function invalid_entry_skips() {
  const dir = path.join(os.tmpdir(), `aic-session-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const beforePath = path.join(dir, ".aic", "session-log.jsonl");
    const beforeExists = fs.existsSync(beforePath);
    const beforeLines = beforeExists
      ? fs.readFileSync(beforePath, "utf8").trim().split("\n").filter(Boolean).length
      : 0;

    appendSessionLog(dir, {
      session_id: 123,
      reason: "user_ended",
      duration_ms: 0,
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    appendSessionLog(dir, {
      session_id: "s1",
      duration_ms: 0,
      timestamp: "2025-01-01T00:00:00.000Z",
    });

    const afterPath = path.join(dir, ".aic", "session-log.jsonl");
    const afterExists = fs.existsSync(afterPath);
    if (afterExists) {
      const afterLines = fs
        .readFileSync(afterPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean).length;
      assert.strictEqual(afterLines, beforeLines);
    }
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "session-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function mkdir_0o700() {
  const dir = path.join(os.tmpdir(), `aic-session-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    appendSessionLog(dir, {
      session_id: "s1",
      reason: "user_ended",
      duration_ms: 0,
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    const aicDir = path.join(dir, ".aic");
    const stat = fs.statSync(aicDir);
    assert.strictEqual(stat.mode & 0o777, 0o700);
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "session-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

const cases = [valid_entry_writes_one_line, invalid_entry_skips, mkdir_0o700];

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
