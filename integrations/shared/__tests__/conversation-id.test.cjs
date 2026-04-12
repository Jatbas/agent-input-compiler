// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const {
  conversationIdFromTranscriptPath,
  conversationIdFromAgentTranscriptPath,
  resolveConversationIdFallback,
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

function transcript_still_wins_over_fallback_parent() {
  const primary = conversationIdFromTranscriptPath({
    transcript_path: "/dir/t.jsonl",
    parent_conversation_id: "parent-fallback",
  });
  assert.strictEqual(primary, "t");
  const fb = resolveConversationIdFallback({
    transcript_path: "/dir/t.jsonl",
    parent_conversation_id: "parent-fallback",
  });
  assert.strictEqual(fb, "parent-fallback");
}

function fallback_parent_before_session() {
  assert.strictEqual(
    resolveConversationIdFallback({
      session_id: "sess-1",
      parent_conversation_id: "par-1",
    }),
    "par-1",
  );
}

function fallback_session_before_generation() {
  assert.strictEqual(
    resolveConversationIdFallback({
      generation_id: "gen-1",
      session_id: "sess-2",
    }),
    "sess-2",
  );
}

function fallback_generation_top_and_input() {
  assert.strictEqual(
    resolveConversationIdFallback({
      input: { generation_id: "gen-nested" },
    }),
    "gen-nested",
  );
}

function fallback_generation_id_camel_case() {
  assert.strictEqual(
    resolveConversationIdFallback({
      generationId: "gen-camel",
    }),
    "gen-camel",
  );
}

function fallback_null_when_empty_candidates() {
  assert.strictEqual(resolveConversationIdFallback({}), null);
}

function fallback_null_when_invalid_control_char() {
  assert.strictEqual(resolveConversationIdFallback({ session_id: "bad\nid" }), null);
}

function fallback_null_when_too_long() {
  const long = "a".repeat(129);
  assert.strictEqual(resolveConversationIdFallback({ session_id: long }), null);
}

function fallback_null_non_string() {
  assert.strictEqual(resolveConversationIdFallback({ session_id: 123 }), null);
}

function direct_conversation_wins_over_fallback_in_combined_use() {
  const parsed = {
    conversation_id: "direct-x",
    session_id: "sess-y",
  };
  const primary = conversationIdFromTranscriptPath(parsed);
  assert.strictEqual(primary, "direct-x");
}

const cases = [
  from_transcript_path_top_level,
  from_transcript_path_input,
  from_conversation_id_top_level,
  from_conversation_id_input,
  transcript_path_precedence_over_conversation_id,
  transcript_still_wins_over_fallback_parent,
  fallback_parent_before_session,
  fallback_session_before_generation,
  fallback_generation_top_and_input,
  fallback_generation_id_camel_case,
  fallback_null_when_empty_candidates,
  fallback_null_when_invalid_control_char,
  fallback_null_when_too_long,
  fallback_null_non_string,
  direct_conversation_wins_over_fallback_in_combined_use,
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
