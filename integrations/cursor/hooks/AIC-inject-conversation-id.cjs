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
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const conversationId =
      input.conversation_id ?? input.conversationId ?? process.env.AIC_CONVERSATION_ID;
    const toolInput = input.tool_input;

    const idStr =
      conversationId !== undefined &&
      conversationId !== null &&
      typeof conversationId === "string" &&
      conversationId.trim() !== ""
        ? conversationId.trim()
        : null;

    const toolName = (input.tool_name || "").toLowerCase();
    const isAicCompile =
      toolName.includes("aic_compile") ||
      (typeof toolInput === "object" &&
        toolInput !== null &&
        typeof toolInput.intent === "string" &&
        typeof toolInput.projectRoot === "string");

    const isAicChatSummary = toolName.includes("aic_chat_summary");

    if (!isAicCompile && !isAicChatSummary) {
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
      if (isValidModelId(trimmed)) {
        updated.modelId = normalizeModelId(trimmed);
        const projectRoot = resolveProjectRoot(null, {
          env: process.env,
          toolInputOverride: toolInput?.projectRoot,
        });
        writeSessionModelCache(
          projectRoot,
          normalizeModelId(trimmed),
          idStr || "",
          "cursor",
        );
      }
    }
    if (updated.conversationId !== undefined || updated.modelId !== undefined) {
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
