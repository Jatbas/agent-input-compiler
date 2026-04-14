// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Cursor hook — subagentStart
// Calls aic_compile with triggerSource "subagent_start" for compilation_log
// telemetry. Cursor's subagentStart output does not support additional_context;
// this hook always returns permission "allow" and never blocks subagent start.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { modelIdFromSubagentStartPayload } = require("./AIC-subagent-start-model-id.cjs");
const {
  writeSessionModelCache,
  readSessionModelCache,
} = require("../../shared/session-model-cache.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const { resolveConversationIdFallback } = require("../../shared/conversation-id.cjs");

let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf8");
  if (raw && raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // Non-fatal — proceed with default intent
}

if (!isCursorNativeHookPayload(hookInput)) {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
} else {
  const projectRoot = resolveProjectRoot(null, { env: process.env });
  const intent =
    typeof hookInput.task === "string" && hookInput.task.trim().length > 0
      ? String(hookInput.task).slice(0, 200)
      : "provide context for subagent";

  const conversationId = (() => {
    if (
      typeof hookInput.parent_conversation_id === "string" &&
      hookInput.parent_conversation_id.trim().length > 0
    ) {
      return hookInput.parent_conversation_id.trim();
    }
    return resolveConversationIdFallback(hookInput);
  })();

  const compileArgs = {
    intent,
    projectRoot,
    editorId: "cursor",
    triggerSource: "subagent_start",
  };
  if (conversationId) compileArgs.conversationId = conversationId;

  const mid = modelIdFromSubagentStartPayload(hookInput);
  if (mid !== null) {
    compileArgs.modelId = mid;
    writeSessionModelCache(projectRoot, mid, conversationId, "cursor");
  } else {
    const cached = readSessionModelCache(projectRoot, conversationId, "cursor");
    if (cached !== null) compileArgs.modelId = cached;
  }

  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "AIC-hook", version: "0.1.0" },
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
    params: { name: "aic_compile", arguments: compileArgs },
  });

  const stdinPayload = `${initRequest}\n${initNotification}\n${compileRequest}\n`;
  const serverScript = path.join(projectRoot, "mcp", "src", "server.ts");
  const isDev = fs.existsSync(serverScript);
  const serverCmd = isDev ? 'npx tsx "' + serverScript + '"' : "npx -y @jatbas/aic";

  try {
    execSync(serverCmd, {
      cwd: projectRoot,
      timeout: 20000,
      encoding: "utf-8",
      input: stdinPayload,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Best-effort — never block subagent start
  }

  process.stdout.write(JSON.stringify({ permission: "allow" }));
}
