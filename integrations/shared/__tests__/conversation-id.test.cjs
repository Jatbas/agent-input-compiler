// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const { conversationIdFromTranscriptPath } = require("../conversation-id.cjs");

function from_transcript_path_top_level() {
  const actual = conversationIdFromTranscriptPath({
    transcript_path: "/dir/conv-uuid.jsonl",
  });
  assert.strictEqual(actual, "conv-uuid");
}

function from_transcript_path_input() {
  const actual = conversationIdFromTranscriptPath({
    input: { transcript_path: "/dir/abc.jsonl" },
  });
  assert.strictEqual(actual, "abc");
}

function null_when_missing() {
  const actual = conversationIdFromTranscriptPath({});
  assert.strictEqual(actual, null);
}

function null_when_parsed_null() {
  const actual = conversationIdFromTranscriptPath(null);
  assert.strictEqual(actual, null);
}

function null_when_empty_string() {
  const actual = conversationIdFromTranscriptPath({ transcript_path: "" });
  assert.strictEqual(actual, null);
}

const cases = [
  from_transcript_path_top_level,
  from_transcript_path_input,
  null_when_missing,
  null_when_parsed_null,
  null_when_empty_string,
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
