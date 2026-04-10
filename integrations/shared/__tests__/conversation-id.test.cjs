// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const {
  conversationIdFromTranscriptPath,
  conversationIdFromAgentTranscriptPath,
} = require("../conversation-id.cjs");

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

function from_agent_transcript_path_extracts_basename() {
  const actual = conversationIdFromAgentTranscriptPath(
    "/home/user/.cursor/projects/proj/agent-transcripts/parent-uuid/subagents/child-uuid.jsonl",
  );
  assert.strictEqual(actual, "child-uuid");
}

function from_agent_transcript_path_null_when_empty() {
  const actual = conversationIdFromAgentTranscriptPath("");
  assert.strictEqual(actual, null);
}

function from_agent_transcript_path_null_when_missing() {
  const actual = conversationIdFromAgentTranscriptPath(null);
  assert.strictEqual(actual, null);
}

function from_conversation_id_top_level() {
  const actual = conversationIdFromTranscriptPath({
    conversation_id: "  direct-uuid-1  ",
  });
  assert.strictEqual(actual, "direct-uuid-1");
}

function from_conversation_id_input() {
  const actual = conversationIdFromTranscriptPath({
    input: { conversation_id: "nested-id-2" },
  });
  assert.strictEqual(actual, "nested-id-2");
}

function transcript_path_precedence_over_conversation_id() {
  const actual = conversationIdFromTranscriptPath({
    transcript_path: "/dir/from-path.jsonl",
    conversation_id: "ignored-id",
  });
  assert.strictEqual(actual, "from-path");
}

const cases = [
  from_transcript_path_top_level,
  from_transcript_path_input,
  from_conversation_id_top_level,
  from_conversation_id_input,
  transcript_path_precedence_over_conversation_id,
  null_when_missing,
  null_when_parsed_null,
  null_when_empty_string,
  from_agent_transcript_path_extracts_basename,
  from_agent_transcript_path_null_when_empty,
  from_agent_transcript_path_null_when_missing,
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
