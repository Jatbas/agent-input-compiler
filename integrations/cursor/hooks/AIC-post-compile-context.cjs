// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// postToolUse hook — when aic_compile succeeded, inject additional_context so the model sees a short confirmation.
// Input: tool_name, tool_input, tool_output, tool_use_id, duration. Output: updated_mcp_tool_output, additional_context.

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const toolName = input.tool_name;
      const toolInput = input.tool_input;
      const toolOutput = input.tool_output;

      const isAicCompileCall =
        (String(toolName).toUpperCase() === "MCP" || toolName === "aic_compile") &&
        typeof toolInput === "object" &&
        toolInput !== null &&
        typeof toolInput.intent === "string" &&
        typeof toolInput.projectRoot === "string";

      if (!isAicCompileCall) {
        process.stdout.write(JSON.stringify({}));
        return;
      }

      const hasSuccessContent =
        typeof toolOutput === "object" &&
        toolOutput !== null &&
        Array.isArray(toolOutput.content) &&
        toolOutput.content.length > 0;

      if (hasSuccessContent) {
        process.stdout.write(
          JSON.stringify({
            additional_context:
              "AIC compilation completed. Use the compiled context for your next response.",
          }),
        );
      } else {
        process.stdout.write(JSON.stringify({}));
      }
    } catch {
      process.stdout.write(JSON.stringify({}));
    }
  });
}

main();
