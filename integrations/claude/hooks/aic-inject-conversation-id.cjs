// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreToolUse hook — inject conversationId, editorId, and modelId (from cache) into aic_compile MCP calls.

const fs = require("fs");
const {
  readSessionModelCache,
  normalizeModelId,
} = require("../../shared/session-model-cache.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../shared/is-cursor-native-hook-payload.cjs");
const {
  conversationIdFromTranscriptPath,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const { isWeakAicCompileIntent } = require("../../shared/is-weak-aic-compile-intent.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");
const { isDevModeTrue } = require("../../shared/read-project-dev-mode.cjs");

function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const isCursorNative = isCursorNativeHookPayload(parsed);
  if (isCursorNative) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  }
  const top = parsed || {};
  const input = top.input || {};
  const toolName = top.tool_name ?? input.tool_name ?? "";
  const toolInput = top.tool_input ?? input.tool_input ?? {};
  const mcpToolName =
    typeof toolInput?.toolName === "string" ? toolInput.toolName.toLowerCase() : "";
  const isAicMcpEnvelope =
    String(toolName).toLowerCase() === "mcp" && mcpToolName.startsWith("aic_");
  const projectRoot = resolveProjectRoot(parsed, {
    toolInputOverride:
      typeof toolInput?.arguments?.projectRoot === "string"
        ? toolInput.arguments.projectRoot
        : toolInput?.projectRoot,
  });
  const conversationId =
    conversationIdFromTranscriptPath(parsed) ?? resolveConversationIdFallback(parsed);
  const isAicCompile =
    /aic_compile/i.test(toolName) ||
    (toolInput.intent != null && toolInput.projectRoot != null);
  if (!isAicCompile && !isAicMcpEnvelope) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  }

  if (!isAicCompile && isAicMcpEnvelope) {
    const preferredServer = isDevModeTrue(projectRoot) ? "aic-dev" : "aic";
    const currentServer =
      typeof toolInput?.server === "string" ? toolInput.server : undefined;
    if (currentServer === preferredServer) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
        },
      };
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...toolInput, server: preferredServer },
      },
    };
  }
  const eid =
    process.env.CURSOR_TRACE_ID && String(process.env.CURSOR_TRACE_ID).trim() !== ""
      ? "cursor-claude-code"
      : "claude-code";
  const result = readSessionModelCache(projectRoot, conversationId, eid);
  const cachedModelId = result !== null ? normalizeModelId(result) : null;
  const updatedInput = {
    ...toolInput,
    editorId: eid,
    ...(conversationId ? { conversationId } : {}),
    ...(cachedModelId && cachedModelId !== "auto" ? { modelId: cachedModelId } : {}),
  };
  if (isWeakAicCompileIntent(toolInput?.intent) && conversationId) {
    const filled = readAicPrewarmPrompt(`cc-${conversationId}`);
    if (filled.length > 0) {
      updatedInput.intent = filled.slice(0, 10000);
    }
  }
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
