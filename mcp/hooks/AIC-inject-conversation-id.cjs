// preToolUse hook — injects conversation_id into aic_compile MCP tool input so
// compilation_log gets conversation_id for model-triggered compilations.
// Cursor sends tool_name as "MCP:aic_compile" and tool_input as a flat object.

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const conversationId = input.conversation_id;
    const toolName = input.tool_name || "";

    if (
      toolName !== "MCP:aic_compile" ||
      !conversationId ||
      typeof conversationId !== "string"
    ) {
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      return;
    }

    const toolInput = input.tool_input;
    const updated =
      typeof toolInput === "object" && toolInput !== null
        ? { ...toolInput, conversationId }
        : toolInput;

    process.stdout.write(JSON.stringify({ decision: "allow", updated_input: updated }));
  } catch {
    process.stdout.write(JSON.stringify({ decision: "allow" }));
  }
});
