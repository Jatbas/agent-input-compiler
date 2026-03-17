// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SubagentStart hook — hookSpecificOutput JSON per CC §6.3; no marker file.

const fs = require("fs");
const path = require("path");
const { callAicCompile } = require("./aic-compile-helper.cjs");

async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const agentType = parsed.agent_type ?? parsed.input?.agent_type ?? "unknown";
  const sessionId = parsed.session_id ?? parsed.input?.session_id ?? null;
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // SubagentStart payload has no conversation_id; fall back to env, then persisted file
  let conversationId =
    parsed.conversation_id ??
    parsed.input?.conversation_id ??
    process.env.AIC_CONVERSATION_ID ??
    null;
  if (conversationId === null) {
    const convFile = path.join(projectRoot, ".aic", ".current-conversation-id");
    try {
      const stored = JSON.parse(fs.readFileSync(convFile, "utf8"));
      if (stored && stored.sessionId === sessionId && stored.conversationId) {
        conversationId = stored.conversationId;
      }
    } catch {
      // ignore ENOENT or invalid JSON
    }
  }

  const intent = "provide context for " + agentType + " subagent";
  const text = await callAicCompile(intent, projectRoot, conversationId, 30000);
  if (text == null) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: text,
    },
  };
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  run(raw)
    .then((out) => {
      if (out != null) process.stdout.write(JSON.stringify(out));
      else process.stdout.write("{}");
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

module.exports = { run };
