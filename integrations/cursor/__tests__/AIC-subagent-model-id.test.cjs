"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { modelIdFromSubagentStartPayload } = require(
  path.join(__dirname, "..", "hooks", "subagent-start-model-id.cjs"),
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

const tests = [
  ["modelId_trim", modelId_trim],
  ["modelId_null_missing", modelId_null_missing],
  ["modelId_null_invalid", modelId_null_invalid],
];
for (const [name, fn] of tests) {
  fn();
  console.log("ok:", name);
}
