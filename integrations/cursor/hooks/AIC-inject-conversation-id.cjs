// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// preToolUse hook — injects conversation_id and modelId into AIC MCP tool inputs.
// Also writes modelId to .aic/session-models.jsonl so Claude Code hooks can read it.

const fs = require("fs");
const path = require("path");

const {
  isValidModelId,
  normalizeModelId,
  writeSessionModelCache,
} = require("../../shared/session-model-cache.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");
const { isWeakAicCompileIntent } = require("../../shared/is-weak-aic-compile-intent.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const { resolveConversationIdFallback } = require("../../shared/conversation-id.cjs");
const { isDevModeTrue } = require("../../shared/read-project-dev-mode.cjs");
const { readLastConversationId } = require("../../shared/compile-recency.cjs");
const { resolveAicServerId } = require("../../shared/resolve-aic-server-id.cjs");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (!isCursorNativeHookPayload(input)) {
      return;
    }
    const conversationId =
      input.conversation_id ?? input.conversationId ?? process.env.AIC_CONVERSATION_ID;
    const toolInput = input.tool_input;

    const projectRoot = resolveProjectRoot(null, {
      env: process.env,
      toolInputOverride:
        typeof toolInput?.arguments?.projectRoot === "string"
          ? toolInput.arguments.projectRoot
          : toolInput?.projectRoot,
    });
    const idStr = (() => {
      if (
        conversationId !== undefined &&
        conversationId !== null &&
        typeof conversationId === "string" &&
        conversationId.trim() !== ""
      ) {
        return conversationId.trim();
      }
      const fb = resolveConversationIdFallback(input);
      if (fb != null) return fb;
      return readLastConversationId(projectRoot);
    })();

    const toolName = (input.tool_name || "").toLowerCase();
    const mcpToolName =
      typeof toolInput?.toolName === "string" ? toolInput.toolName.toLowerCase() : "";
    const isMcpEnvelope =
      toolName === "mcp" || toolName === "call_mcp_tool" || toolName === "callmcptool";
    const isAicMcpEnvelope = isMcpEnvelope && mcpToolName.startsWith("aic_");
    const isAicCompile =
      toolName.includes("aic_compile") ||
      (typeof toolInput === "object" &&
        toolInput !== null &&
        typeof toolInput.intent === "string" &&
        typeof toolInput.projectRoot === "string");

    const isAicChatSummary = toolName.includes("aic_chat_summary");

    const normalizeMcpServer = () => {
      if (!isAicMcpEnvelope) {
        return { changed: false, nextToolInput: toolInput };
      }
      const runtimeId = resolveAicServerId(projectRoot);
      const preferredServer =
        runtimeId ?? (isDevModeTrue(projectRoot) ? "aic-dev" : "aic");
      if (toolInput.server === preferredServer) {
        return { changed: false, nextToolInput: toolInput };
      }
      return {
        changed: true,
        nextToolInput: { ...toolInput, server: preferredServer },
      };
    };

    const normalizedServer = normalizeMcpServer();

    if (!isAicCompile && !isAicChatSummary && !isAicMcpEnvelope) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    if (!isAicCompile && !isAicChatSummary && isAicMcpEnvelope) {
      if (normalizedServer.changed) {
        process.stdout.write(
          JSON.stringify({
            permission: "allow",
            updated_input: normalizedServer.nextToolInput,
          }),
        );
        return;
      }
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    if (isAicChatSummary) {
      if (!idStr) {
        process.stdout.write(JSON.stringify({ permission: "allow" }));
        return;
      }
      const updated = { ...toolInput, conversationId: idStr };
      process.stdout.write(
        JSON.stringify({ permission: "allow", updated_input: updated }),
      );
      return;
    }

    // isAicCompile
    const updated = { ...toolInput, editorId: "cursor" };
    if (idStr) updated.conversationId = idStr;
    if (typeof input.model === "string") {
      const trimmed = input.model.trim();
      const normalized = normalizeModelId(trimmed);
      if (isValidModelId(trimmed)) {
        updated.modelId = normalized;
        if (normalized !== "auto") {
          const projectRoot = resolveProjectRoot(null, {
            env: process.env,
            toolInputOverride: toolInput?.projectRoot,
          });
          writeSessionModelCache(projectRoot, normalized, idStr || "", "cursor");
        }
      }
    }
    const generationId = input.generation_id ?? input.generationId ?? "unknown";
    if (isWeakAicCompileIntent(toolInput?.intent)) {
      const filled = readAicPrewarmPrompt(generationId);
      if (filled.length > 0) {
        updated.intent = filled.slice(0, 10000);
      }
    }
    const shouldEmitUpdatedInput =
      Boolean(idStr) ||
      updated.modelId !== undefined ||
      updated.intent !== toolInput.intent;
    if (shouldEmitUpdatedInput) {
      process.stdout.write(
        JSON.stringify({ permission: "allow", updated_input: updated }),
      );
    } else {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
    }
  } catch {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
  }
});
