// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// preToolUse hook — injects conversation_id into AIC MCP tool inputs so
// compilation_log and chat_summary get the correct conversation_id per call.

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const conversationId = input.conversation_id || process.env.AIC_CONVERSATION_ID;
    const toolInput = input.tool_input;

    if (!conversationId || typeof conversationId !== "string") {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

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

    const updated = { ...toolInput, conversationId };
    process.stdout.write(JSON.stringify({ permission: "allow", updated_input: updated }));
  } catch {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
  }
});
