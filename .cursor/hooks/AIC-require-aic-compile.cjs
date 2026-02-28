// preToolUse hook — blocks all tools until aic_compile has been called for this generation.
// Reads the exact user prompt saved by before-submit-prewarm.cjs and includes it
// in the deny reason so the model copies it verbatim → cache hit from pre-warm.
const fs = require("fs");
const path = require("path");
const os = require("os");

function getStateFile(generationId) {
  return path.join(os.tmpdir(), `aic-gate-${generationId}`);
}

function getPromptFile(generationId) {
  return path.join(os.tmpdir(), `aic-prompt-${generationId}`);
}

function readSavedPrompt(generationId) {
  try {
    return fs.readFileSync(getPromptFile(generationId), "utf8").trim();
  } catch {
    return "";
  }
}

function isAicCompileMcpCall(toolName, toolInput) {
  if (toolName !== "MCP") return false;
  try {
    const input = typeof toolInput === "string" ? JSON.parse(toolInput) : toolInput;
    if (input && input.tool_name === "aic_compile") return true;
    if (input && input.name === "aic_compile") return true;
  } catch {
    /* ignore parse errors */
  }
  const inputStr =
    typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput || {});
  return inputStr.includes("aic_compile");
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const generationId = input.generation_id || "unknown";
    const toolName = input.tool_name || "";
    const toolInput = input.tool_input || {};
    const stateFile = getStateFile(generationId);

    if (isAicCompileMcpCall(toolName, toolInput)) {
      fs.writeFileSync(stateFile, "1");
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      return;
    }

    if (fs.existsSync(stateFile)) {
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      return;
    }

    // aic_compile not yet called — deny with the exact user prompt as intent
    const savedPrompt = readSavedPrompt(generationId);
    const intentArg =
      savedPrompt.length > 0
        ? savedPrompt.replace(/"/g, '\\"')
        : "<summarise the user message>";

    process.stdout.write(
      JSON.stringify({
        decision: "deny",
        reason: `BLOCKED: You must call the aic_compile MCP tool FIRST before using any other tool. Call it now with { "intent": "${intentArg}", "projectRoot": "/Users/jatbas/Desktop/AIC" }`,
      }),
    );
  } catch {
    // Fail-open: allow on parse error
    process.stdout.write(JSON.stringify({ decision: "allow" }));
  }
});
