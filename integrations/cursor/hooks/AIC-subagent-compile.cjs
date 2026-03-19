// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Cursor hook — subagentStart
// Calls aic_compile with triggerSource "subagent_start" for compilation_log
// telemetry. Cursor's subagentStart output does not support additional_context;
// this hook always returns permission "allow" and never blocks subagent start.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { modelIdFromSubagentStartPayload } = require("./subagent-start-model-id.cjs");
const {
  isValidModelId,
  isValidConversationId,
  isValidEditorId,
} = require("../../shared/cache-field-validators.cjs");

let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf8");
  if (raw && raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // Non-fatal — proceed with default intent
}

const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();
const intent =
  typeof hookInput.task === "string" && hookInput.task.trim().length > 0
    ? String(hookInput.task).slice(0, 200)
    : "provide context for subagent";

const conversationId =
  typeof hookInput.parent_conversation_id === "string" &&
  hookInput.parent_conversation_id.trim().length > 0
    ? hookInput.parent_conversation_id.trim()
    : null;

const compileArgs = {
  intent,
  projectRoot,
  editorId: "cursor",
  triggerSource: "subagent_start",
};
if (conversationId) compileArgs.conversationId = conversationId;

function writeSessionModelCache(root, modelId, convId) {
  try {
    const filePath = path.join(root, ".aic", "session-models.jsonl");
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const entry = JSON.stringify({
      c: typeof convId === "string" ? convId.trim() : "",
      m: modelId,
      e: "cursor",
      timestamp: new Date().toISOString(),
    });
    fs.appendFileSync(filePath, entry + "\n", "utf8");
  } catch {
    // non-fatal
  }
}

function readSessionModelCache(root, convId) {
  try {
    const raw = fs.readFileSync(path.join(root, ".aic", "session-models.jsonl"), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const cid = typeof convId === "string" ? convId.trim() : "";
    let lastMatch = null;
    let lastAny = null;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (
          typeof entry.m !== "string" ||
          !isValidModelId(entry.m) ||
          typeof entry.c !== "string" ||
          !isValidConversationId(entry.c) ||
          typeof entry.e !== "string" ||
          !isValidEditorId(entry.e) ||
          entry.e !== "cursor"
        ) {
          continue;
        }
        lastAny = entry.m;
        if (cid.length > 0 && entry.c === cid) lastMatch = entry.m;
      } catch {
        // skip malformed
      }
    }
    return lastMatch !== null ? lastMatch : lastAny;
  } catch {
    // no cache
  }
  return null;
}

const mid = modelIdFromSubagentStartPayload(hookInput);
if (mid !== null) {
  compileArgs.modelId = mid;
  writeSessionModelCache(projectRoot, mid, conversationId);
} else {
  const cached = readSessionModelCache(projectRoot, conversationId);
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

try {
  execSync('npx tsx "' + serverScript + '"', {
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
