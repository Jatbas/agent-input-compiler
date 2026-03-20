// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SubagentStart hook — hookSpecificOutput JSON per CC §6.3; no marker file.

const { resolveProjectRoot } = require("../../../shared/resolve-project-root.cjs");
const {
  conversationIdFromTranscriptPath,
} = require("../../../shared/conversation-id.cjs");
const { callAicCompile } = require("./aic-compile-helper.cjs");

async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const agentType = parsed.agent_type ?? parsed.input?.agent_type ?? "unknown";
  const projectRoot = resolveProjectRoot(parsed);
  const conversationId = conversationIdFromTranscriptPath(parsed);

  const rawPrompt = parsed.prompt ?? parsed.input?.prompt ?? null;
  const intent = rawPrompt
    ? String(rawPrompt)
        .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "")
        .trim()
    : "provide context for " + agentType + " subagent";
  const text = await callAicCompile(
    intent,
    projectRoot,
    conversationId,
    30000,
    "subagent_start",
  );
  if (text == null) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: text,
    },
  };
}

if (require.main === module) {
  const fs = require("fs");
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
