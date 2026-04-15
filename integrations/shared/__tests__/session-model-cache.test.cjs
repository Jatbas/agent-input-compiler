// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  isValidModelId,
  normalizeModelId,
  readSessionModelCache,
  writeSessionModelCache,
} = require("../session-model-cache.cjs");
const {
  selectSessionModelIdFromJsonlContent,
} = require("../select-session-model-from-jsonl.cjs");

function normalizeModelId_default() {
  assert.strictEqual(normalizeModelId("default"), "auto");
  assert.strictEqual(normalizeModelId("Default"), "auto");
}

function normalizeModelId_passthrough() {
  assert.strictEqual(normalizeModelId("claude-sonnet-4"), "claude-sonnet-4");
}

function isValidModelId_empty() {
  assert.strictEqual(isValidModelId(""), false);
}

function isValidModelId_valid() {
  assert.strictEqual(isValidModelId("a"), true);
}

function isValidModelId_too_long() {
  assert.strictEqual(isValidModelId("x".repeat(257)), false);
}

function write_read_roundtrip() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const modelId = "claude-sonnet-4";
    writeSessionModelCache(dir, modelId, "conv-1", "cursor");
    const got = readSessionModelCache(dir, "conv-1", "cursor");
    assert.strictEqual(got, modelId);
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "session-models.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function read_filters_editorId() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    writeSessionModelCache(dir, "model-a", "c1", "cursor");
    writeSessionModelCache(dir, "model-b", "c1", "claude-code");
    const forCursor = readSessionModelCache(dir, "c1", "cursor");
    const forClaude = readSessionModelCache(dir, "c1", "claude-code");
    assert.strictEqual(forCursor, "model-a");
    assert.strictEqual(forClaude, "model-b");
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "session-models.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function read_skips_invalid_line() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  const aicDir = path.join(dir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true });
  const filePath = path.join(aicDir, "session-models.jsonl");
  fs.writeFileSync(
    filePath,
    "not valid json\n" +
      JSON.stringify({
        c: "c1",
        m: "valid-model",
        e: "cursor",
        timestamp: "2025-01-01T00:00:00.000Z",
      }) +
      "\n",
    "utf8",
  );
  try {
    const got = readSessionModelCache(dir, "c1", "cursor");
    assert.strictEqual(got, "valid-model");
  } finally {
    try {
      fs.rmSync(filePath, { force: true });
      fs.rmdirSync(aicDir, { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function read_fallback_matches_full_file_when_conv_line_only_in_prefix() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  const aicDir = path.join(dir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true });
  const filePath = path.join(aicDir, "session-models.jsonl");
  const wanted = JSON.stringify({
    m: "prefix-hit",
    c: "conv-prefix",
    e: "cursor",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  const filler = `${JSON.stringify({
    m: "other",
    c: "other-conv",
    e: "cursor",
    timestamp: "2026-01-02T00:00:00.000Z",
  })}\n`.repeat(8000);
  fs.writeFileSync(filePath, `${wanted}\n${filler}`, "utf8");
  try {
    const rawFull = fs.readFileSync(filePath, "utf8");
    const expected = selectSessionModelIdFromJsonlContent(
      rawFull,
      "conv-prefix",
      "cursor",
    );
    const got = readSessionModelCache(dir, "conv-prefix", "cursor");
    assert.strictEqual(got, expected);
    assert.strictEqual(got, "prefix-hit");
  } finally {
    try {
      fs.rmSync(filePath, { force: true });
      fs.rmdirSync(aicDir, { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function write_skips_auto() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    writeSessionModelCache(dir, "claude-sonnet-4.6", "conv-1", "cursor");
    writeSessionModelCache(dir, "auto", "conv-1", "cursor");
    const got = readSessionModelCache(dir, "conv-1", "cursor");
    assert.strictEqual(got, "claude-sonnet-4.6");
  } finally {
    try {
      fs.rmSync(path.join(dir, ".aic", "session-models.jsonl"), { force: true });
      fs.rmdirSync(path.join(dir, ".aic"), { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function read_skips_auto_entries_from_file() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  const aicDir = path.join(dir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true });
  const filePath = path.join(aicDir, "session-models.jsonl");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      m: "auto",
      c: "conv-1",
      e: "cursor",
      timestamp: "2026-01-01T00:00:00.000Z",
    }) +
      "\n" +
      JSON.stringify({
        m: "claude-sonnet-4.6",
        c: "conv-1",
        e: "cursor",
        timestamp: "2026-01-02T00:00:00.000Z",
      }) +
      "\n" +
      JSON.stringify({
        m: "auto",
        c: "conv-1",
        e: "cursor",
        timestamp: "2026-01-03T00:00:00.000Z",
      }) +
      "\n",
    "utf8",
  );
  try {
    const got = readSessionModelCache(dir, "conv-1", "cursor");
    assert.strictEqual(got, "claude-sonnet-4.6");
  } finally {
    try {
      fs.rmSync(filePath, { force: true });
      fs.rmdirSync(aicDir, { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function read_returns_null_when_only_auto_entries_exist() {
  const dir = path.join(os.tmpdir(), `aic-session-cache-test-${Date.now()}`);
  const aicDir = path.join(dir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true });
  const filePath = path.join(aicDir, "session-models.jsonl");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      m: "auto",
      c: "conv-1",
      e: "cursor",
      timestamp: "2026-01-01T00:00:00.000Z",
    }) + "\n",
    "utf8",
  );
  try {
    const got = readSessionModelCache(dir, "conv-1", "cursor");
    assert.strictEqual(got, null);
  } finally {
    try {
      fs.rmSync(filePath, { force: true });
      fs.rmdirSync(aicDir, { recursive: true });
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

const cases = [
  normalizeModelId_default,
  normalizeModelId_passthrough,
  isValidModelId_empty,
  isValidModelId_valid,
  isValidModelId_too_long,
  write_read_roundtrip,
  read_filters_editorId,
  read_skips_invalid_line,
  read_fallback_matches_full_file_when_conv_line_only_in_prefix,
  write_skips_auto,
  read_skips_auto_entries_from_file,
  read_returns_null_when_only_auto_entries_exist,
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
