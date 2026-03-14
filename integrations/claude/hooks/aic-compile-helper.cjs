// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Claude Code protocol adapter — calls AIC MCP server via stdio JSON-RPC and returns compiled prompt.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function callAicCompile(intent, projectRoot, sessionId, timeoutMs) {
  const serverPath = path.join(projectRoot, "mcp", "src", "server.ts");
  const args = fs.existsSync(serverPath) ? ["tsx", serverPath] : ["@jatbas/aic"];
  const initReq = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "AIC-claude-hook", version: "0.1.0" },
    },
  });
  const initNotif = JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  const toolsCall = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "aic_compile",
      arguments: {
        intent,
        projectRoot,
        ...(sessionId ? { conversationId: sessionId } : {}),
      },
    },
  });
  const stdinPayload = [initReq, initNotif, toolsCall].join("\n") + "\n";
  try {
    const raw = execFileSync("npx", args, {
      cwd: projectRoot,
      timeout: timeoutMs || 25000,
      encoding: "utf-8",
      input: stdinPayload,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const msg = JSON.parse(line);
      if (msg.id === 2 && msg.result && msg.result.content) {
        const textContent = msg.result.content.find((c) => c.type === "text");
        if (textContent) {
          const parsed = JSON.parse(textContent.text);
          if (parsed.compiledPrompt) return parsed.compiledPrompt;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { callAicCompile };
