// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { appendPromptLog } = require("../prompt-log.cjs");

function valid_prompt_type() {
  const dir = path.join(os.tmpdir(), `aic-prompt-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const entry = {
      type: "prompt",
      editorId: "cursor",
      conversationId: "c1",
      timestamp: "2025-01-01T00:00:00.000Z",
      generationId: "g1",
      title: "test title",
      model: "",
    };
    appendPromptLog(dir, entry);
    const logPath = path.join(dir, ".aic", "prompt-log.jsonl");
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.trim().split("\n");
    assert.strictEqual(lines.length, 1);
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(parsed.type, "prompt");
    assert.strictEqual(parsed.editorId, "cursor");
    assert.strictEqual(parsed.conversationId, "c1");
    assert.strictEqual(parsed.timestamp, "2025-01-01T00:00:00.000Z");
    assert.strictEqual(parsed.generationId, "g1");
    assert.strictEqual(parsed.title, "test title");
    assert.strictEqual(parsed.model, "");
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "prompt-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function valid_session_end_type() {
  const dir = path.join(os.tmpdir(), `aic-prompt-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    appendPromptLog(dir, {
      type: "session_end",
      editorId: "claude-code",
      conversationId: "c2",
      timestamp: "2025-01-02T00:00:00.000Z",
      reason: "user_ended",
    });
    const logPath = path.join(dir, ".aic", "prompt-log.jsonl");
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.trim().split("\n");
    assert.strictEqual(lines.length, 1);
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(parsed.type, "session_end");
    assert.strictEqual(parsed.reason, "user_ended");
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "prompt-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function invalid_envelope_rejected() {
  const dir = path.join(os.tmpdir(), `aic-prompt-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    appendPromptLog(dir, {
      type: "prompt",
      editorId: "",
      conversationId: "c1",
      timestamp: "2025-01-01T00:00:00.000Z",
      generationId: "g1",
      title: "t",
      model: "",
    });
    const logPath = path.join(dir, ".aic", "prompt-log.jsonl");
    const exists = fs.existsSync(logPath);
    if (exists) {
      const lineCount = fs
        .readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean).length;
      assert.strictEqual(lineCount, 0);
    }
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "prompt-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function invalid_type_rejected() {
  const dir = path.join(os.tmpdir(), `aic-prompt-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    appendPromptLog(dir, {
      type: "other",
      editorId: "cursor",
      conversationId: "c1",
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    const logPath = path.join(dir, ".aic", "prompt-log.jsonl");
    const exists = fs.existsSync(logPath);
    if (exists) {
      const lineCount = fs
        .readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean).length;
      assert.strictEqual(lineCount, 0);
    }
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "prompt-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function mkdir_mode_0700() {
  const dir = path.join(os.tmpdir(), `aic-prompt-log-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    appendPromptLog(dir, {
      type: "prompt",
      editorId: "cursor",
      conversationId: "c1",
      timestamp: "2025-01-01T00:00:00.000Z",
      generationId: "g1",
      title: "t",
      model: "",
    });
    const aicDir = path.join(dir, ".aic");
    const stat = fs.statSync(aicDir);
    assert.strictEqual(stat.mode & 0o777, 0o700);
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "prompt-log.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function backward_compat_legacy_shape() {
  const dir = path.join(os.tmpdir(), `aic-prompt-log-test-${Date.now()}`);
  const aicDir = path.join(dir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true });
  const logPath = path.join(aicDir, "prompt-log.jsonl");
  fs.writeFileSync(
    logPath,
    '{"conversationId":"c","timestamp":"2025-01-01T00:00:00.000Z"}\n',
    "utf8",
  );
  try {
    appendPromptLog(dir, {
      type: "prompt",
      editorId: "cursor",
      conversationId: "c1",
      timestamp: "2025-01-02T00:00:00.000Z",
      generationId: "g1",
      title: "unified",
      model: "",
    });
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    assert.ok(lines.length >= 2);
    const hasTimestamp = lines.every((line) => {
      const obj = JSON.parse(line);
      return typeof obj.timestamp === "string";
    });
    assert.strictEqual(hasTimestamp, true);
  } finally {
    try {
      fs.rmSync(logPath, { force: true });
      fs.rmdirSync(aicDir, { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

const cases = [
  valid_prompt_type,
  valid_session_end_type,
  invalid_envelope_rejected,
  invalid_type_rejected,
  mkdir_mode_0700,
  backward_compat_legacy_shape,
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
if (failed > 0) process.exit(1);
