// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Cursor hook — sessionStart
// Calls aic_compile via the MCP server's stdio JSON-RPC protocol and injects
// the compiled project context into the conversation's system prompt via
// additional_context. This runs before the model sees anything — deterministic.
// conversationId is set only when a conversation-scoped id is present (never session_id).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();
const INTENT = "understand project structure, architecture, and recent changes";
const TIMEOUT_MS = 20000;

let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf8");
  if (raw && raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // Non-fatal — proceed without conversation_id
}

const conversationId = hookInput.conversation_id || null;

function normalizeModelId(raw) {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

let modelId = null;
if (typeof hookInput.model === "string") {
  const trimmed = hookInput.model.trim();
  if (trimmed.length >= 1 && trimmed.length <= 256 && /^[\x20-\x7E]+$/.test(trimmed)) {
    modelId = normalizeModelId(trimmed);
    try {
      const smPath = path.join(projectRoot, ".aic", "session-models.jsonl");
      fs.mkdirSync(path.dirname(smPath), { recursive: true, mode: 0o700 });
      const entry = JSON.stringify({
        c: conversationId || "",
        m: modelId,
        e: "cursor",
        timestamp: new Date().toISOString(),
      });
      fs.appendFileSync(smPath, entry + "\n", "utf8");
    } catch {
      // non-fatal
    }
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
// Build a JSON-RPC request to call aic_compile via the MCP server
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
    arguments: compileArgs,
  },
});

const stdinPayload = `${initRequest}\n${initNotification}\n${compileRequest}\n`;

try {
  const serverScript = path.join(projectRoot, "mcp", "src", "server.ts");
  const raw = execSync(`npx tsx "${serverScript}"`, {
    cwd: projectRoot,
    timeout: TIMEOUT_MS,
    encoding: "utf-8",
    input: stdinPayload,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Parse JSON-RPC responses (may be multiple lines)
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2 && msg.result && msg.result.content) {
        const textContent = msg.result.content.find((c) => c.type === "text");
        if (textContent) {
          const parsed = JSON.parse(textContent.text);
          if (parsed.compiledPrompt) {
            const output = JSON.stringify({
              env: {
                AIC_PROJECT_ROOT: projectRoot,
                AIC_CONVERSATION_ID:
                  conversationId && typeof conversationId === "string"
                    ? conversationId
                    : "",
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
                parsed.compiledPrompt,
              ].join("\n"),
            });
            process.stdout.write(output);
            break;
          }
        }
      }
    } catch {
      // skip unparseable lines
    }
  }
} catch {
  // Non-fatal — never block session creation
  process.exit(0);
}
