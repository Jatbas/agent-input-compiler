"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { modelIdFromSubagentStartPayload } = require(
  path.join(__dirname, "..", "hooks", "AIC-subagent-start-model-id.cjs"),
);
const { readSessionModelCache, writeSessionModelCache, normalizeModelId } = require(
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

function cacheFallback_reads_valid_cache() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeSessionModelCache(tmp, "claude-4.6-opus-high-thinking", "", "cursor");
  assert.equal(
    readSessionModelCache(tmp, null, "cursor"),
    "claude-4.6-opus-high-thinking",
  );
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_null_when_missing() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  assert.equal(readSessionModelCache(tmp, null, "cursor"), null);
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_null_when_invalid() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  const filePath = path.join(tmp, ".aic", "session-models.jsonl");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "not valid json\n", "utf8");
  assert.equal(readSessionModelCache(tmp, null, "cursor"), null);
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_prefers_conversation_scoped() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeSessionModelCache(tmp, "fallback-model", "", "cursor");
  writeSessionModelCache(tmp, "scoped-model", "conv-abc", "cursor");
  assert.equal(readSessionModelCache(tmp, "conv-abc", "cursor"), "scoped-model");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_falls_through_to_any() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeSessionModelCache(tmp, "other-model", "conv-other", "cursor");
  assert.equal(readSessionModelCache(tmp, "conv-missing", "cursor"), "other-model");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function cacheFallback_no_convId_returns_last_any() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  writeSessionModelCache(tmp, "model-a", "conv-a", "cursor");
  writeSessionModelCache(tmp, "model-b", "conv-b", "cursor");
  assert.equal(readSessionModelCache(tmp, null, "cursor"), "model-b");
  assert.equal(readSessionModelCache(tmp, "", "cursor"), "model-b");
  assert.equal(readSessionModelCache(tmp, undefined, "cursor"), "model-b");
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
  assert.equal(readSessionModelCache(tmp, null, "cursor"), null);
  writeSessionModelCache(tmp, "cursor-opus", "", "cursor");
  assert.equal(readSessionModelCache(tmp, null, "cursor"), "cursor-opus");
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
