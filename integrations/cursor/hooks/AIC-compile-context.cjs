// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Cursor hook — sessionStart
// Calls aic_compile via the MCP server's stdio JSON-RPC protocol and injects
// the compiled project context into the conversation's system prompt via
// additional_context. This runs before the model sees anything — deterministic.
// conversationId uses transcript/direct resolution first, then deterministic fallback
// (parent_conversation_id, session_id, generation_id) when primary fields are absent.
const { execFileSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");

const {
  isValidModelId,
  normalizeModelId,
  writeSessionModelCache,
} = require("../../shared/session-model-cache.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  conversationIdFromTranscriptPath,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const {
  writeCompileRecency,
  writeLastConversationId,
} = require("../../shared/compile-recency.cjs");

const projectRoot = resolveProjectRoot(null, { env: process.env });
const INTENT = "understand project structure, architecture, and recent changes";

let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf8");
  if (raw && raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // Non-fatal — proceed without conversation_id
}

if (!isCursorNativeHookPayload(hookInput)) {
  process.exit(0);
}

const conversationId =
  conversationIdFromTranscriptPath(hookInput) ?? resolveConversationIdFallback(hookInput);
if (conversationId != null && conversationId.trim().length > 0) {
  writeLastConversationId(projectRoot, conversationId.trim());
}

let modelId = null;
if (typeof hookInput.model === "string") {
  const trimmed = hookInput.model.trim();
  const normalized = normalizeModelId(trimmed);
  if (isValidModelId(trimmed) && normalized !== "auto") {
    modelId = normalized;
    writeSessionModelCache(projectRoot, modelId, conversationId || "", "cursor");
  }
}

const compileArgs = {
  intent: INTENT,
  projectRoot: projectRoot,
  editorId: "cursor",
  triggerSource: "session_start",
};
if (modelId !== null) {
  compileArgs.modelId = modelId;
}
if (
  conversationId &&
  typeof conversationId === "string" &&
  conversationId.trim().length > 0
) {
  compileArgs.conversationId = conversationId.trim();
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
// prod argv mirrors npx -y @jatbas/aic (structural test anchor)

try {
  const execOpts = {
    cwd: projectRoot,
    timeout: 20000,
    encoding: "utf-8",
    input: stdinPayload,
    stdio: ["pipe", "pipe", "pipe"],
  };
  const stdout = isDev
    ? execFileSync("npx", ["tsx", serverScript], execOpts)
    : execFileSync("npx", ["-y", "@jatbas/aic"], execOpts);

  let compiledPrompt = null;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2 && msg.result && msg.result.content) {
        const textContent = msg.result.content.find((c) => c.type === "text");
        if (textContent) {
          const parsed = JSON.parse(textContent.text);
          if (parsed.compiledPrompt) {
            compiledPrompt = parsed.compiledPrompt;
            break;
          }
        }
      }
    } catch {
      // ignore non-JSON lines
    }
  }

  if (compiledPrompt) {
    writeCompileRecency(projectRoot);
    const output = JSON.stringify({
      env: {
        AIC_PROJECT_ROOT: projectRoot,
        AIC_CONVERSATION_ID:
          conversationId && typeof conversationId === "string" ? conversationId : "",
      },
      additional_context: [
        "## AIC Compiled Context (auto-injected at session start)",
        "The following is the most relevant project context, compiled by AIC.",
        "Use this to inform your responses. For intent-specific context,",
        "call the aic_compile MCP tool with the user's specific intent.",
        "",
        "REMINDER: You MUST call aic_compile as your FIRST action on EVERY",
        "message in this chat — not just the first one. Each follow-up message",
        "has a different intent that needs fresh context compilation.",
        "",
        compiledPrompt,
      ].join("\n"),
    });
    process.stdout.write(output);
  }
} catch {
  // Non-fatal — never block session creation
}
