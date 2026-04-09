// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Cursor hook — subagentStop
// Reparents compilation_log entries from the subagent's conversation_id
// to the parent's conversation_id so all compilations in a chat session
// are tracked under one conversation.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  conversationIdFromAgentTranscriptPath,
} = require("../../shared/conversation-id.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");

let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf8");
  if (raw && raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // Non-fatal — proceed without input
}

const projectRoot = resolveProjectRoot(null, { env: process.env });

const parentConversationId = (() => {
  if (
    typeof hookInput.conversation_id === "string" &&
    hookInput.conversation_id.trim().length > 0
  ) {
    return hookInput.conversation_id.trim();
  }
  if (
    typeof hookInput.parent_conversation_id === "string" &&
    hookInput.parent_conversation_id.trim().length > 0
  ) {
    return hookInput.parent_conversation_id.trim();
  }
  return null;
})();

const childConversationId = conversationIdFromAgentTranscriptPath(
  hookInput.agent_transcript_path,
);

if (
  parentConversationId !== null &&
  childConversationId !== null &&
  parentConversationId !== childConversationId
) {
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
    params: {
      name: "aic_compile",
      arguments: {
        intent: "reparent subagent compilations",
        projectRoot,
        editorId: "cursor",
        triggerSource: "subagent_stop",
        conversationId: parentConversationId,
        reparentFromConversationId: childConversationId,
      },
    },
  });

  const stdinPayload = `${initRequest}\n${initNotification}\n${compileRequest}\n`;
  const serverScript = path.join(projectRoot, "mcp", "src", "server.ts");
  const isDev = fs.existsSync(serverScript);
  const serverCmd = isDev ? 'npx tsx "' + serverScript + '"' : "npx -y @jatbas/aic";

  try {
    execSync(serverCmd, {
      cwd: projectRoot,
      timeout: 10000,
      encoding: "utf-8",
      input: stdinPayload,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Best-effort — never block returning from subagent
  }
}

process.stdout.write(JSON.stringify({}));
