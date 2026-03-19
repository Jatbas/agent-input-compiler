// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Claude Code protocol adapter — calls AIC MCP server via stdio JSON-RPC and returns compiled prompt.
// Uses async spawn to keep stdin open until the tools/call response arrives;
// server.ts exits on stdin EOF before async handlers complete (race condition).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  isValidModelId,
  normalizeModelId,
  readSessionModelCache,
  writeSessionModelCache,
} = require("../../shared/session-model-cache.cjs");

// conversationId must be conversation-scoped (not session_id) for correct chat summary attribution.
// modelId: string with content, or null, or undefined; undefined: resolve from sixth param first; if empty, read projectRoot/.aic/session-models.jsonl

function detectEditorId() {
  if (process.env.CURSOR_TRACE_ID && String(process.env.CURSOR_TRACE_ID).trim() !== "") {
    return "cursor-claude-code";
  }
  return "claude-code";
}

function callAicCompile(
  intent,
  projectRoot,
  conversationId,
  timeoutMs,
  triggerSource,
  modelId,
) {
  const timeout = timeoutMs || 25000;
  const serverPath = path.join(projectRoot, "mcp", "src", "server.ts");
  const isDev = fs.existsSync(serverPath);
  const needsBuild =
    isDev && fs.existsSync(path.join(projectRoot, "shared", "package.json"));
  const spawnCmd = needsBuild ? "sh" : "npx";
  const spawnArgs = needsBuild
    ? ["-c", "pnpm --filter @jatbas/aic-core build >&2 && npx tsx " + serverPath]
    : isDev
      ? ["tsx", serverPath]
      : ["@jatbas/aic"];
  const editorId = detectEditorId();
  let resolved = null;
  if (isValidModelId(modelId)) {
    resolved = normalizeModelId(String(modelId).trim());
    writeSessionModelCache(projectRoot, resolved, conversationId || "", editorId);
  } else {
    const cached = readSessionModelCache(projectRoot, conversationId, editorId);
    if (cached !== null) resolved = normalizeModelId(cached);
  }
  const initReq = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "AIC-claude-code-hook", version: "0.1.0" },
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
        editorId,
        ...(conversationId ? { conversationId } : {}),
        ...(triggerSource ? { triggerSource } : {}),
        ...(resolved ? { modelId: resolved } : {}),
      },
    },
  });

  return new Promise((resolve) => {
    const child = spawn(spawnCmd, spawnArgs, {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill("SIGTERM");
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeout);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2 && msg.result && msg.result.content) {
            const textContent = msg.result.content.find((c) => c.type === "text");
            if (textContent) {
              const parsed = JSON.parse(textContent.text);
              if (parsed.compiledPrompt) {
                finish(parsed.compiledPrompt);
                return;
              }
            }
          }
        } catch {
          // not a complete JSON line yet
        }
      }
    });

    child.on("error", () => finish(null));
    child.on("close", () => finish(null));

    child.stdin.write(initReq + "\n");
    child.stdin.write(initNotif + "\n");
    child.stdin.write(toolsCall + "\n");
  });
}

module.exports = { callAicCompile };
