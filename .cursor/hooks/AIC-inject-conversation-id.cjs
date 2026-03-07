// preToolUse hook — injects conversation_id into aic_compile MCP tool input so
// compilation_log gets conversation_id for model-triggered compilations.
// Detects aic_compile by payload (intent + projectRoot) so we cover all tool_name variants.

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

    const isAicCompile =
      typeof toolInput === "object" &&
      toolInput !== null &&
      typeof toolInput.intent === "string" &&
      typeof toolInput.projectRoot === "string";

    if (!isAicCompile || !conversationId || typeof conversationId !== "string") {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    const updated = { ...toolInput, conversationId };
    process.stdout.write(JSON.stringify({ permission: "allow", updated_input: updated }));
  } catch {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
  }
});
