// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// preToolUse hook — injects conversation_id and modelId into AIC MCP tool inputs.
// Also writes modelId to .aic/.claude-session-model so Claude Code hooks can read it.

const fs = require("fs");
const path = require("path");

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
      if (
        trimmed.length >= 1 &&
        trimmed.length <= 256 &&
        /^[\x20-\x7E]+$/.test(trimmed)
      ) {
        updated.modelId = trimmed;
        const projectRoot =
          (toolInput && toolInput.projectRoot) ||
          process.env.CURSOR_PROJECT_DIR ||
          process.cwd();
        try {
          const cacheDir = path.join(projectRoot, ".aic");
          fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
          fs.writeFileSync(path.join(cacheDir, ".claude-session-model"), trimmed, "utf8");
        } catch {
          // non-fatal
        }
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
