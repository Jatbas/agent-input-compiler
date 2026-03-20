// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// preToolUse hook — blocks all tools until aic_compile has been called for this generation.
// Reads the exact user prompt saved by before-submit-prewarm.cjs and includes it
// in the deny message so the model copies it verbatim → cache hit from pre-warm.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");

// Skip enforcement when developing AIC (set AIC_DEV_MODE=1 in env or .env).
// The hook process may not inherit .env, so load it from the project root.
if (process.env.AIC_DEV_MODE !== "1") {
  try {
    const projectRoot = resolveProjectRoot(null, { env: process.env });
    const envFile = fs.readFileSync(path.join(projectRoot, ".env"), "utf8");
    const match = envFile.match(/^AIC_DEV_MODE\s*=\s*(.+)$/m);
    if (match && match[1].trim() === "1") {
      process.env.AIC_DEV_MODE = "1";
    }
  } catch {
    // .env missing or unreadable — continue with normal enforcement
  }
}
if (process.env.AIC_DEV_MODE === "1") {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

function getStateFile(generationId) {
  return path.join(os.tmpdir(), `aic-gate-${generationId}`);
}

function getDenyMarker(generationId) {
  return path.join(os.tmpdir(), `aic-deny-${generationId}`);
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
  try {
    const input = typeof toolInput === "string" ? JSON.parse(toolInput) : toolInput;
    if (input && input.toolName === "aic_compile") return true;
    if (input && input.tool_name === "aic_compile") return true;
    if (input && input.name === "aic_compile") return true;
  } catch {
    /* ignore parse errors */
  }
  const inputStr =
    typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput || {});
  if (inputStr.includes("aic_compile")) return true;
  if (toolName.includes("aic_compile")) return true;
  return false;
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
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    if (fs.existsSync(stateFile)) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    // Deny-once-then-allow: the gate is a reminder, not a security enforcement.
    // If we already denied once for this generation, allow through.
    const denyMarker = getDenyMarker(generationId);
    if (fs.existsSync(denyMarker)) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    // First denial for this generation — write marker, then deny with instruction.
    fs.writeFileSync(denyMarker, "1");

    const savedPrompt = readSavedPrompt(generationId);
    const stripped = savedPrompt.replace(
      /<ide_selection>[\s\S]*?<\/ide_selection>/gi,
      "",
    );
    const intentArg =
      stripped.length > 0
        ? stripped.replace(/"/g, '\\"')
        : "<summarise the user message>";

    const projectRoot = resolveProjectRoot(null, { env: process.env });
    const denyMsg = `BLOCKED: You must call the aic_compile MCP tool FIRST before using any other tool. Call it now with { "intent": "${intentArg}", "projectRoot": "${projectRoot}" }`;
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: denyMsg,
        agent_message: denyMsg,
      }),
    );
  } catch {
    // Fail-open: allow on parse error
    process.stdout.write(JSON.stringify({ permission: "allow" }));
  }
});
