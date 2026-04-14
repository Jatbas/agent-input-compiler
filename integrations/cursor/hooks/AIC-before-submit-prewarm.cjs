// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// beforeSubmitPrompt hook — logs the user's prompt with conversation context,
// and saves it so the preToolUse gate can include the exact intent in the deny
// reason. Zero token cost: returns { continue: true } immediately.
//
// Writes to .aic/prompt-log.jsonl — one JSON line per prompt with:
// conversation_id, generation_id, prompt (first 200 chars as title), timestamp
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const { appendPromptLog } = require("../../shared/prompt-log.cjs");
const {
  isValidModelId,
  normalizeModelId,
  writeSessionModelCache,
} = require("../../shared/session-model-cache.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const { writeCompileRecency } = require("../../shared/compile-recency.cjs");
const { touchEditorRuntimeMarker } = require("../../shared/editor-runtime-marker.cjs");

const projectRoot = resolveProjectRoot(null, { env: process.env });

function fireCompileAsync(prompt, conversationId, model) {
  try {
    const compileArgs = {
      intent: (prompt || "").slice(0, 200),
      projectRoot,
      editorId: "cursor",
      triggerSource: "before_submit",
    };
    if (conversationId) compileArgs.conversationId = conversationId;
    if (model) compileArgs.modelId = model;

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
    const cmd = "npx";
    const args = isDev ? ["tsx", serverScript] : ["-y", "@jatbas/aic"];

    const child = spawn(cmd, args, {
      cwd: projectRoot,
      stdio: ["pipe", "ignore", "ignore"],
      detached: true,
    });
    child.stdin.write(stdinPayload);
    child.stdin.end();
    child.unref();
  } catch {
    // Non-fatal — never block prompt submission
  }
}

function promptFile(generationId) {
  return path.join(os.tmpdir(), `aic-prompt-${generationId}`);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (!isCursorNativeHookPayload(input)) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }
    const conversationId = input.conversation_id || "unknown";
    const generationId = input.generation_id || "unknown";
    const prompt = (input.prompt || "").trim();
    touchEditorRuntimeMarker(projectRoot, "cursor", conversationId);
    const model = input.model || "";

    if (prompt.length > 0) {
      fs.writeFileSync(promptFile(generationId), prompt, "utf8");

      const ts = new Date().toISOString();
      appendPromptLog(projectRoot, {
        type: "prompt",
        editorId: "cursor",
        conversationId,
        generationId,
        title: prompt.slice(0, 200),
        model,
        timestamp: ts,
      });

      const normalizedModel = normalizeModelId(model.trim());
      if (isValidModelId(model) && normalizedModel !== "auto") {
        writeSessionModelCache(
          projectRoot,
          normalizedModel,
          conversationId,
          "cursor",
          ts,
        );
      }

      fireCompileAsync(prompt, conversationId, normalizedModel);
      writeCompileRecency(projectRoot);
    }
  } catch {
    // Non-fatal
  }

  process.stdout.write(JSON.stringify({ continue: true }));
});
