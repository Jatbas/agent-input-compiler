"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { modelIdFromSubagentStartPayload } = require(
  path.join(__dirname, "..", "hooks", "subagent-start-model-id.cjs"),
);
const { normalizeModelId } = require(
  path.join(__dirname, "..", "..", "shared", "session-model-cache.cjs"),
);

function modelId_trim() {
  assert.equal(
    modelIdFromSubagentStartPayload({ subagent_model: "  gpt-fast  " }),
    "gpt-fast",
  );
}

function modelId_null_missing() {
  assert.equal(modelIdFromSubagentStartPayload({}), null);
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: undefined }), null);
}

function modelId_null_invalid() {
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: "" }), null);
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: "   " }), null);
  assert.equal(
    modelIdFromSubagentStartPayload({ subagent_model: "a".repeat(257) }),
    null,
  );
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: "x\ny" }), null);
}

function modelId_normalizes_default_to_auto() {
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: "default" }), "auto");
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: "Default" }), "auto");
  assert.equal(modelIdFromSubagentStartPayload({ subagent_model: "DEFAULT" }), "auto");
}

function modelId_preserves_real_model_names() {
  assert.equal(
    modelIdFromSubagentStartPayload({ subagent_model: "claude-4.6-opus-high-thinking" }),
    "claude-4.6-opus-high-thinking",
  );
}

function normalizeModelId_standalone() {
  assert.equal(normalizeModelId("default"), "auto");
  assert.equal(normalizeModelId("Default"), "auto");
  assert.equal(normalizeModelId("DEFAULT"), "auto");
  assert.equal(normalizeModelId("claude-sonnet-4"), "claude-sonnet-4");
  assert.equal(normalizeModelId("auto"), "auto");
}

function isValidModelId(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 256 && /^[\x20-\x7E]+$/.test(t);
}

function readCacheFallback(projectRoot, convId) {
  try {
    const raw = fs.readFileSync(
      path.join(projectRoot, ".aic", "session-models.jsonl"),
      "utf8",
    );
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const cid = typeof convId === "string" ? convId.trim() : "";
    let lastMatch = null;
    let lastAny = null;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (
          typeof entry.m === "string" &&
          isValidModelId(entry.m) &&
          entry.e === "cursor"
        ) {
          lastAny = entry.m;
          if (cid.length > 0 && entry.c === cid) lastMatch = entry.m;
        }
      } catch {
        // skip malformed
      }
    }
    return lastMatch !== null ? lastMatch : lastAny;
  } catch {
    // no cache
  }
  return null;
}

function writeJsonlEntry(projectRoot, convId, modelId) {
  const filePath = path.join(projectRoot, ".aic", "session-models.jsonl");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const entry = JSON.stringify({
    c: convId || "",
    m: modelId,
    e: "cursor",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  fs.appendFileSync(filePath, entry + "\n", "utf8");
}

function cacheFallback_reads_valid_cache() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeJsonlEntry(tmp, "", "claude-4.6-opus-high-thinking");
  assert.equal(readCacheFallback(tmp, null), "claude-4.6-opus-high-thinking");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_null_when_missing() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  assert.equal(readCacheFallback(tmp, null), null);
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_null_when_invalid() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  const filePath = path.join(tmp, ".aic", "session-models.jsonl");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "not valid json\n", "utf8");
  assert.equal(readCacheFallback(tmp, null), null);
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_prefers_conversation_scoped() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeJsonlEntry(tmp, "", "fallback-model");
  writeJsonlEntry(tmp, "conv-abc", "scoped-model");
  assert.equal(readCacheFallback(tmp, "conv-abc"), "scoped-model");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_falls_through_to_any() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeJsonlEntry(tmp, "conv-other", "other-model");
  assert.equal(readCacheFallback(tmp, "conv-missing"), "other-model");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_no_convId_returns_last_any() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeJsonlEntry(tmp, "conv-a", "model-a");
  writeJsonlEntry(tmp, "conv-b", "model-b");
  assert.equal(readCacheFallback(tmp, null), "model-b");
  assert.equal(readCacheFallback(tmp, ""), "model-b");
  assert.equal(readCacheFallback(tmp, undefined), "model-b");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_ignores_other_editor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  const filePath = path.join(tmp, ".aic", "session-models.jsonl");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const claude = JSON.stringify({
    c: "",
    m: "claude-sonnet",
    e: "claude-code",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  fs.appendFileSync(filePath, claude + "\n", "utf8");
  assert.equal(readCacheFallback(tmp, null), null);
  writeJsonlEntry(tmp, "", "cursor-opus");
  assert.equal(readCacheFallback(tmp, null), "cursor-opus");
  fs.rmSync(tmp, { recursive: true, force: true });
}

const tests = [
  ["modelId_trim", modelId_trim],
  ["modelId_null_missing", modelId_null_missing],
  ["modelId_null_invalid", modelId_null_invalid],
  ["modelId_normalizes_default_to_auto", modelId_normalizes_default_to_auto],
  ["modelId_preserves_real_model_names", modelId_preserves_real_model_names],
  ["normalizeModelId_standalone", normalizeModelId_standalone],
  ["cacheFallback_reads_valid_cache", cacheFallback_reads_valid_cache],
  ["cacheFallback_null_when_missing", cacheFallback_null_when_missing],
  ["cacheFallback_null_when_invalid", cacheFallback_null_when_invalid],
  [
    "cacheFallback_prefers_conversation_scoped",
    cacheFallback_prefers_conversation_scoped,
  ],
  ["cacheFallback_falls_through_to_any", cacheFallback_falls_through_to_any],
  ["cacheFallback_no_convId_returns_last_any", cacheFallback_no_convId_returns_last_any],
  ["cacheFallback_ignores_other_editor", cacheFallback_ignores_other_editor],
];
for (const [name, fn] of tests) {
  fn();
  console.log("ok:", name);
}
