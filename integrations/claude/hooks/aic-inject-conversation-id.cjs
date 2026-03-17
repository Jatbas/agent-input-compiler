// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreToolUse hook — inject conversationId and editorId into aic_compile MCP calls.

const fs = require("fs");
const path = require("path");

function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const top = parsed || {};
  const input = top.input || {};
  const toolName = top.tool_name ?? input.tool_name ?? "";
  const toolInput = top.tool_input ?? input.tool_input ?? {};
  const cwdRaw = top.cwd ?? input.cwd ?? "";
  const projectRoot = (toolInput.projectRoot || cwdRaw || "").trim()
    ? (toolInput.projectRoot || cwdRaw).trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let conversationId = top.conversation_id ?? input.conversation_id ?? null;
  if (conversationId === null && projectRoot) {
    try {
      const convFile = path.join(projectRoot, ".aic", ".current-conversation-id");
      const stored = JSON.parse(fs.readFileSync(convFile, "utf8"));
      if (stored && stored.conversationId) {
        conversationId = stored.conversationId;
      }
    } catch {
      // ignore ENOENT or invalid JSON
    }
  }
  const isAicCompile =
    /aic_compile/i.test(toolName) ||
    (toolInput.intent != null && toolInput.projectRoot != null);
  if (!isAicCompile) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  }
  const updatedInput = {
    ...toolInput,
    editorId: "claude-code",
    ...(conversationId ? { conversationId } : {}),
  };
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput,
    },
  };
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  const out = run(raw);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

module.exports = { run };
