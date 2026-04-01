// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const os = require("os");
const path = require("path");
const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-inject-conversation-id.cjs");

function cc_inject_replaces_weak_intent_with_prewarm_prompt() {
  const transcriptPath = path.join(os.tmpdir(), "aic-cc-prewarm-test.jsonl");
  const conversationId = conversationIdFromTranscriptPath({
    transcript_path: transcriptPath,
  });
  const prewarmPath = path.join(os.tmpdir(), `aic-prompt-cc-${conversationId}`);
  fs.writeFileSync(prewarmPath, "refactor auth module for oauth", "utf8");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const out = run(
    JSON.stringify({
      transcript_path: transcriptPath,
      tool_name: "aic_compile",
      tool_input: { intent: "general context compilation", projectRoot: "/tmp/x" },
    }),
  );
  try {
    fs.unlinkSync(prewarmPath);
  } catch {
    /* ignore */
  }
  const intent = out?.hookSpecificOutput?.updatedInput?.intent;
  if (intent !== "refactor auth module for oauth") {
    throw new Error(`Expected prewarm intent, got ${JSON.stringify(intent)}`);
  }
  console.log("cc_inject_replaces_weak_intent_with_prewarm_prompt: pass");
}

function cc_inject_skips_when_prewarm_missing() {
  const transcriptPath = path.join(os.tmpdir(), "aic-cc-no-prewarm-unique.jsonl");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const out = run(
    JSON.stringify({
      transcript_path: transcriptPath,
      tool_name: "aic_compile",
      tool_input: { intent: "general context compilation", projectRoot: "/tmp/x" },
    }),
  );
  const intent = out?.hookSpecificOutput?.updatedInput?.intent;
  if (intent !== "general context compilation") {
    throw new Error(`Expected default intent, got ${JSON.stringify(intent)}`);
  }
  console.log("cc_inject_skips_when_prewarm_missing: pass");
}

cc_inject_replaces_weak_intent_with_prewarm_prompt();
cc_inject_skips_when_prewarm_missing();
console.log("All tests passed.");
