// Shared helper — calls aic_compile via MCP stdio and returns the compiled prompt.
// Used by SessionStart, UserPromptSubmit, SubagentStart, and PreCompact hooks.
const { execSync } = require("child_process");
const path = require("path");

function callAicCompile(intent, projectRoot, timeoutMs) {
  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "AIC-claude-hook", version: "0.1.0" },
    },
  });

  const initNotification = JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  const compileRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "aic_compile",
      arguments: { intent, projectRoot },
    },
  });

  const stdinPayload = `${initRequest}\n${initNotification}\n${compileRequest}\n`;
  const serverScript = path.join(projectRoot, "mcp", "src", "server.ts");

  const raw = execSync(`npx tsx "${serverScript}"`, {
    cwd: projectRoot,
    timeout: timeoutMs || 20000,
    encoding: "utf-8",
    input: stdinPayload,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2 && msg.result && msg.result.content) {
        const textContent = msg.result.content.find((c) => c.type === "text");
        if (textContent) {
          const parsed = JSON.parse(textContent.text);
          if (parsed.compiledPrompt) {
            return parsed.compiledPrompt;
          }
        }
      }
    } catch {
      // skip unparseable JSON-RPC lines
    }
  }
  return null;
}

module.exports = { callAicCompile };
