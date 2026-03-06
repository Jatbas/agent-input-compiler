// preToolUse hook — injects conversation_id into aic_compile MCP tool input so
// compilation_log gets conversation_id for model-triggered compilations.
// When editor does not provide conversation_id, reads .aic/conversation-id as fallback (never creates).
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
    const editorConversationId = input.conversation_id;
    const toolInput = input.tool_input;

    const isAicCompile =
      typeof toolInput === "object" &&
      toolInput !== null &&
      typeof toolInput.intent === "string" &&
      typeof toolInput.projectRoot === "string";

    if (!isAicCompile) {
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      return;
    }

    if (
      editorConversationId &&
      typeof editorConversationId === "string" &&
      editorConversationId.length > 0
    ) {
      const updated = { ...toolInput, conversationId: editorConversationId };
      process.stdout.write(JSON.stringify({ decision: "allow", updated_input: updated }));
      return;
    }

    if (
      toolInput.conversationId &&
      typeof toolInput.conversationId === "string" &&
      toolInput.conversationId.length > 0
    ) {
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      return;
    }

    const conversationIdPath = path.join(
      toolInput.projectRoot,
      ".aic",
      "conversation-id",
    );
    let fromFile = null;
    try {
      const content = fs.readFileSync(conversationIdPath, "utf8");
      const trimmed = content.trim();
      if (trimmed.length > 0) fromFile = trimmed;
    } catch {
      // File missing or unreadable — do not create
    }

    if (fromFile === null) {
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      return;
    }

    const updated = { ...toolInput, conversationId: fromFile };
    process.stdout.write(JSON.stringify({ decision: "allow", updated_input: updated }));
  } catch {
    process.stdout.write(JSON.stringify({ decision: "allow" }));
  }
});
