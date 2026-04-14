// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// SubagentStop hook — reparents subagent compilation_log entries to parent conversation.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  conversationIdFromTranscriptPath,
  conversationIdFromAgentTranscriptPath,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../cursor/is-cursor-native-hook-payload.cjs");

function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }

  const isCursorNative = isCursorNativeHookPayload(parsed);
  if (isCursorNative) return null;

  const projectRoot = resolveProjectRoot(parsed);
  const parentConversationId =
    conversationIdFromTranscriptPath(parsed) ?? resolveConversationIdFallback(parsed);
  const childConversationId = conversationIdFromAgentTranscriptPath(
    parsed.agent_transcript_path ?? parsed.input?.agent_transcript_path ?? null,
  );

  if (
    parentConversationId !== null &&
    childConversationId !== null &&
    parentConversationId !== childConversationId
  ) {
    const serverScript = path.join(projectRoot, "mcp", "src", "server.ts");
    const isDev = fs.existsSync(serverScript);
    const serverInvocation = isDev ? `npx tsx "${serverScript}"` : "npx -y @jatbas/aic";

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
          editorId: "claude-code",
          triggerSource: "subagent_stop",
          conversationId: parentConversationId,
          reparentFromConversationId: childConversationId,
        },
      },
    });

    const stdinPayload = `${initRequest}\n${initNotification}\n${compileRequest}\n`;

    try {
      execSync(serverInvocation, {
        cwd: projectRoot,
        timeout: 10000,
        input: stdinPayload,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Best-effort — never block returning from subagent
    }
  }

  return null;
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  run(raw);
  process.stdout.write("{}");
  process.exit(0);
}

module.exports = { run };
